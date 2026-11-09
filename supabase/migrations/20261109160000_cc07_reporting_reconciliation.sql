-- CC-07.02 / CC-07.04 / CC-07.10
-- Additive reconciliation exception evidence, currency-safe revenue and receivables reporting.
-- No production execution, backfill, financial mutation, FX conversion or seed data.

-- The TypeScript reconciler already emits status_mismatch. Persist that supported
-- classification rather than silently dropping or failing a reconciliation run.
ALTER TABLE public.commercial_reconciliation_items
  DROP CONSTRAINT IF EXISTS commercial_reconciliation_items_item_type_check;
ALTER TABLE public.commercial_reconciliation_items
  ADD CONSTRAINT commercial_reconciliation_items_item_type_check
  CHECK (item_type IN (
    'matched','missing_internal','missing_provider','duplicate','amount_mismatch',
    'currency_mismatch','status_mismatch','unallocated','reversed'
  ));

-- Immutable lifecycle/evidence stream for each reconciliation exception.
CREATE TABLE IF NOT EXISTS public.commercial_reconciliation_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.commercial_reconciliation_items(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'opened','review_started','evidence_added','resolved','reopened','escalated'
  )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('founder_admin','service_principal')),
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) BETWEEN 2 AND 120),
  note text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  resolution_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type <> 'resolved' OR nullif(btrim(resolution_ref),'') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS commercial_recon_item_events_item_time_idx
  ON public.commercial_reconciliation_item_events(item_id, occurred_at DESC);
ALTER TABLE public.commercial_reconciliation_item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_reconciliation_item_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_reconciliation_item_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.commercial_reconciliation_item_events TO service_role;
CREATE POLICY commercial_recon_item_events_service_role
  ON public.commercial_reconciliation_item_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reject_commercial_reconciliation_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Reconciliation evidence is append-only; record a compensating lifecycle event'
    USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_commercial_reconciliation_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS commercial_reconciliation_item_events_immutable
  ON public.commercial_reconciliation_item_events;
CREATE TRIGGER commercial_reconciliation_item_events_immutable
  BEFORE UPDATE OR DELETE ON public.commercial_reconciliation_item_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_reconciliation_event_mutation();

-- Founder/service-side function only. This appends evidence and never mutates
-- payment, invoice, allocation, provider notification or reconciliation source rows.
CREATE OR REPLACE FUNCTION public.commercial_record_reconciliation_item_event(
  _item_id uuid,
  _event_type text,
  _actor_user_id uuid,
  _actor_role text,
  _reason_code text,
  _note text DEFAULT NULL,
  _evidence jsonb DEFAULT '{}'::jsonb,
  _resolution_ref text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_item public.commercial_reconciliation_items%ROWTYPE;
  v_run public.commercial_reconciliation_runs%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _event_type NOT IN ('review_started','evidence_added','reopened','escalated')
    OR _actor_role NOT IN ('founder_admin','service_principal')
    OR length(btrim(coalesce(_reason_code,''))) NOT BETWEEN 2 AND 120
    OR jsonb_typeof(_evidence) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid reconciliation lifecycle event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_item FROM public.commercial_reconciliation_items WHERE id=_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation exception not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_run FROM public.commercial_reconciliation_runs WHERE id=v_item.run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status='completed' THEN
    RAISE EXCEPTION 'Completed reconciliation evidence cannot be changed' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_item FROM public.commercial_reconciliation_items WHERE id=_item_id FOR UPDATE;
  IF _event_type='review_started' THEN
    IF v_item.resolution_status='resolved' THEN
      RAISE EXCEPTION 'Resolved exception must be reopened before review' USING ERRCODE = '55000';
    END IF;
    UPDATE public.commercial_reconciliation_items
      SET resolution_status='reviewed' WHERE id=_item_id AND resolution_status='unresolved';
  ELSIF _event_type='reopened' THEN
    IF v_item.resolution_status<>'resolved' THEN
      RAISE EXCEPTION 'Only a resolved exception can be reopened' USING ERRCODE = '55000';
    END IF;
    UPDATE public.commercial_reconciliation_items
      SET resolution_status='unresolved',resolution_ref=NULL WHERE id=_item_id;
  END IF;
  INSERT INTO public.commercial_reconciliation_item_events(
    item_id,event_type,actor_user_id,actor_role,reason_code,note,evidence,resolution_ref
  ) VALUES (
    _item_id,_event_type,_actor_user_id,_actor_role,_reason_code,_note,_evidence,_resolution_ref
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_record_reconciliation_item_event(uuid,text,uuid,text,text,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_record_reconciliation_item_event(uuid,text,uuid,text,text,text,jsonb,text)
  TO service_role;

-- Stable provider-period identity prevents duplicate overlapping reconciliation runs.
CREATE UNIQUE INDEX IF NOT EXISTS commercial_reconciliation_run_source_unique
  ON public.commercial_reconciliation_runs(
    provider_account_id,currency,period_start,period_end,source_ref
  ) WHERE provider_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commercial_create_reconciliation_run(
  _provider_account_id uuid,
  _currency text,
  _period_start timestamptz,
  _period_end timestamptz,
  _source_ref text,
  _actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
  v_provider public.commercial_provider_accounts%ROWTYPE;
  v_id uuid; v_status text; v_replayed boolean;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _currency NOT IN ('TZS','USD') OR _period_start IS NULL OR _period_end <= _period_start
    OR length(btrim(coalesce(_source_ref,''))) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'Invalid reconciliation run period, currency or source reference' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_provider FROM public.commercial_provider_accounts
    WHERE id=_provider_account_id AND status='active'
      AND _currency=ANY(supported_currencies);
  IF NOT FOUND THEN RAISE EXCEPTION 'Active provider account/currency not found' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.commercial_reconciliation_runs(
    organisation_id,provider_account_id,currency,period_start,period_end,source_ref,started_by
  ) VALUES (
    v_provider.organisation_id,_provider_account_id,_currency,_period_start,_period_end,_source_ref,_actor_user_id
  )
  ON CONFLICT (provider_account_id,currency,period_start,period_end,source_ref)
    WHERE provider_account_id IS NOT NULL
  DO NOTHING
  RETURNING id,status INTO v_id,v_status;
  v_replayed := v_id IS NULL;
  IF v_replayed THEN
    SELECT id,status INTO v_id,v_status
    FROM public.commercial_reconciliation_runs
    WHERE provider_account_id=_provider_account_id AND currency=_currency
      AND period_start=_period_start AND period_end=_period_end AND source_ref=_source_ref;
  END IF;
  RETURN jsonb_build_object('id',v_id,'status',v_status,'replayed',v_replayed);
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_create_reconciliation_run(uuid,text,timestamptz,timestamptz,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_create_reconciliation_run(uuid,text,timestamptz,timestamptz,text,uuid)
  TO service_role;

-- Item creation and resolution are atomic with their lifecycle evidence.
CREATE OR REPLACE FUNCTION public.commercial_create_reconciliation_item(
  _run_id uuid,
  _item_type text,
  _internal_payment_id uuid,
  _provider_ref text,
  _expected_amount_minor numeric,
  _observed_amount_minor numeric,
  _expected_currency text,
  _observed_currency text,
  _evidence jsonb,
  _resolution_status text,
  _resolution_ref text,
  _actor_user_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
  v_run public.commercial_reconciliation_runs%ROWTYPE; v_item_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.commercial_reconciliation_runs
    WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'open' THEN
    RAISE EXCEPTION 'Open reconciliation run was not found' USING ERRCODE = '55000';
  END IF;
  IF _item_type NOT IN ('matched','missing_internal','missing_provider','duplicate',
      'amount_mismatch','currency_mismatch','status_mismatch','unallocated','reversed')
    OR jsonb_typeof(_evidence) IS DISTINCT FROM 'object'
    OR (_expected_currency IS NOT NULL AND _expected_currency NOT IN ('TZS','USD'))
    OR (_observed_currency IS NOT NULL AND _observed_currency NOT IN ('TZS','USD'))
    OR (_expected_amount_minor IS NOT NULL AND _expected_amount_minor < 0)
    OR (_observed_amount_minor IS NOT NULL AND _observed_amount_minor < 0)
    OR _resolution_status NOT IN ('unresolved','reviewed','resolved')
    OR (_resolution_status='resolved' AND nullif(btrim(_resolution_ref),'') IS NULL) THEN
    RAISE EXCEPTION 'Invalid reconciliation item' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.commercial_reconciliation_items(
    run_id,item_type,internal_payment_id,provider_ref,expected_amount_minor,
    observed_amount_minor,expected_currency,observed_currency,evidence,resolution_status,resolution_ref
  ) VALUES (
    _run_id,_item_type,_internal_payment_id,_provider_ref,_expected_amount_minor,
    _observed_amount_minor,_expected_currency,_observed_currency,_evidence,_resolution_status,_resolution_ref
  ) RETURNING id INTO v_item_id;
  INSERT INTO public.commercial_reconciliation_item_events(
    item_id,event_type,actor_user_id,actor_role,reason_code,evidence
  ) VALUES (
    v_item_id,'opened',_actor_user_id,'founder_admin','reconciliation_exception_opened',_evidence
  );
  IF _resolution_status='resolved' THEN
    INSERT INTO public.commercial_reconciliation_item_events(
      item_id,event_type,actor_user_id,actor_role,reason_code,evidence,resolution_ref
    ) VALUES (
      v_item_id,'resolved',_actor_user_id,'founder_admin','reconciliation_exact_match',
      jsonb_build_object('itemType',_item_type),_resolution_ref
    );
  END IF;
  RETURN v_item_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_create_reconciliation_item(uuid,text,uuid,text,numeric,numeric,text,text,jsonb,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_create_reconciliation_item(uuid,text,uuid,text,numeric,numeric,text,text,jsonb,text,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_resolve_reconciliation_item(
  _item_id uuid, _resolution_ref text, _actor_user_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
  v_item public.commercial_reconciliation_items%ROWTYPE;
  v_run public.commercial_reconciliation_runs%ROWTYPE; v_event_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_resolution_ref),'') IS NULL THEN
    RAISE EXCEPTION 'Resolution reference is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_item FROM public.commercial_reconciliation_items
    WHERE id=_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.resolution_status='resolved' THEN
    IF v_item.resolution_ref IS DISTINCT FROM _resolution_ref THEN
      RAISE EXCEPTION 'Conflicting reconciliation resolution replay' USING ERRCODE = '23505';
    END IF;
    SELECT id INTO v_event_id FROM public.commercial_reconciliation_item_events
      WHERE item_id=_item_id AND event_type='resolved' AND resolution_ref=_resolution_ref
      ORDER BY occurred_at DESC LIMIT 1;
    RETURN v_event_id;
  END IF;
  SELECT * INTO v_run FROM public.commercial_reconciliation_runs
    WHERE id=v_item.run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status='completed' THEN
    RAISE EXCEPTION 'Completed reconciliation evidence cannot be changed' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_item FROM public.commercial_reconciliation_items
    WHERE id=_item_id FOR UPDATE;
  IF v_item.resolution_status='resolved' THEN
    IF v_item.resolution_ref IS DISTINCT FROM _resolution_ref THEN
      RAISE EXCEPTION 'Conflicting reconciliation resolution replay' USING ERRCODE = '23505';
    END IF;
    SELECT id INTO v_event_id FROM public.commercial_reconciliation_item_events
      WHERE item_id=_item_id AND event_type='resolved' AND resolution_ref=_resolution_ref
      ORDER BY occurred_at DESC LIMIT 1;
    RETURN v_event_id;
  END IF;
  UPDATE public.commercial_reconciliation_items
    SET resolution_status='resolved',resolution_ref=_resolution_ref
    WHERE id=_item_id;
  INSERT INTO public.commercial_reconciliation_item_events(
    item_id,event_type,actor_user_id,actor_role,reason_code,evidence,resolution_ref
  ) VALUES (
    _item_id,'resolved',_actor_user_id,'founder_admin','reconciliation_exception_resolved',
    jsonb_build_object('resolutionRef',_resolution_ref),_resolution_ref
  ) RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_resolve_reconciliation_item(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_resolve_reconciliation_item(uuid,text,uuid)
  TO service_role;

-- A provider statement may be imported only once per reconciliation run.
-- The import record and all findings commit atomically.
CREATE TABLE IF NOT EXISTS public.commercial_reconciliation_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.commercial_reconciliation_runs(id) ON DELETE RESTRICT,
  source_ref text NOT NULL,
  row_count integer NOT NULL CHECK (row_count >= 0),
  finding_count integer NOT NULL CHECK (finding_count >= 0),
  imported_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_reconciliation_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_reconciliation_statement_imports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_reconciliation_statement_imports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.commercial_reconciliation_statement_imports TO service_role;
CREATE POLICY commercial_reconciliation_statement_imports_service_role
  ON public.commercial_reconciliation_statement_imports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS commercial_reconciliation_statement_imports_immutable
  ON public.commercial_reconciliation_statement_imports;
CREATE TRIGGER commercial_reconciliation_statement_imports_immutable
  BEFORE UPDATE OR DELETE ON public.commercial_reconciliation_statement_imports
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_reconciliation_event_mutation();

CREATE OR REPLACE FUNCTION public.commercial_import_reconciliation_statement(
  _run_id uuid, _rows jsonb, _actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
  v_run public.commercial_reconciliation_runs%ROWTYPE;
  v_existing public.commercial_reconciliation_statement_imports%ROWTYPE;
  v_row record; v_finding_count integer := 0; v_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) > 1000 THEN
    RAISE EXCEPTION 'Provider statement rows must be an array of at most 1000 findings' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_run FROM public.commercial_reconciliation_runs
    WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation run was not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_existing FROM public.commercial_reconciliation_statement_imports
    WHERE run_id=_run_id;
  IF FOUND THEN
    RETURN jsonb_build_object('runId',_run_id,'rowCount',v_existing.row_count,
      'findingCount',v_existing.finding_count,'replayed',true);
  END IF;
  IF v_run.status <> 'open' THEN
    RAISE EXCEPTION 'Only an open reconciliation run accepts a statement import' USING ERRCODE = '55000';
  END IF;
  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(_rows) AS x(
      item_type text, internal_payment_id uuid, provider_ref text,
      expected_amount_minor numeric, observed_amount_minor numeric,
      expected_currency text, observed_currency text, evidence jsonb,
      resolution_status text, resolution_ref text
    )
  LOOP
    v_id := public.commercial_create_reconciliation_item(
      _run_id,v_row.item_type,v_row.internal_payment_id,v_row.provider_ref,
      v_row.expected_amount_minor,v_row.observed_amount_minor,
      v_row.expected_currency,v_row.observed_currency,
      coalesce(v_row.evidence,'{}'::jsonb),v_row.resolution_status,
      v_row.resolution_ref,_actor_user_id
    );
    v_finding_count := v_finding_count + 1;
  END LOOP;
  INSERT INTO public.commercial_reconciliation_statement_imports(
    run_id,source_ref,row_count,finding_count,imported_by
  ) VALUES (_run_id,v_run.source_ref,jsonb_array_length(_rows),v_finding_count,_actor_user_id);
  INSERT INTO public.commercial_financial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,
    resource_type,resource_ref,outcome,metadata
  ) VALUES (
    gen_random_uuid()::text,_actor_user_id,v_run.organisation_id,'founder_admin',
    'reconciliation.statement_imported','reconciliation_run',_run_id::text,'succeeded',
    jsonb_build_object('rowCount',jsonb_array_length(_rows),'findingCount',v_finding_count,'sourceRef',v_run.source_ref)
  );
  RETURN jsonb_build_object('runId',_run_id,'rowCount',jsonb_array_length(_rows),
    'findingCount',v_finding_count,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_import_reconciliation_statement(uuid,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_import_reconciliation_statement(uuid,jsonb,uuid)
  TO service_role;

-- Serialize run closure against item creation and resolution to prevent
-- a run being marked complete while a concurrent exception is still committing.
CREATE OR REPLACE FUNCTION public.commercial_complete_reconciliation_run(
  _run_id uuid, _actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
  v_run public.commercial_reconciliation_runs%ROWTYPE;
  v_unresolved integer; v_status text;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.commercial_reconciliation_runs
    WHERE id=_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation run not found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status = 'completed' THEN
    RETURN jsonb_build_object('runId',v_run.id,'status',v_run.status,'replayed',true);
  END IF;
  SELECT count(*) INTO v_unresolved
  FROM public.commercial_reconciliation_items
  WHERE run_id=_run_id AND resolution_status <> 'resolved';
  v_status := CASE WHEN v_unresolved > 0 THEN 'discrepancy' ELSE 'completed' END;
  UPDATE public.commercial_reconciliation_runs
    SET status=v_status,completed_at=CASE WHEN v_status='completed' THEN now() ELSE NULL END
    WHERE id=_run_id;
  INSERT INTO public.commercial_financial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,
    resource_type,resource_ref,outcome,metadata
  ) VALUES (
    gen_random_uuid()::text,_actor_user_id,v_run.organisation_id,'founder_admin',
    'reconciliation.completed','reconciliation_run',_run_id::text,'succeeded',
    jsonb_build_object('status',v_status,'unresolvedItems',v_unresolved)
  );
  RETURN jsonb_build_object('runId',_run_id,'status',v_status,'unresolvedItems',v_unresolved,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_complete_reconciliation_run(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_reconciliation_run(uuid,uuid)
  TO service_role;

-- Aging is calculated from the authoritative receivable view at query time.
-- Numeric amounts remain NUMERIC(20,0); no JavaScript-number conversion or FX.
CREATE OR REPLACE VIEW public.commercial_receivables_aging AS
SELECT r.id AS invoice_id, r.organisation_id, r.account_id, r.subscription_id,
  r.invoice_number, r.currency, r.status, r.issued_at, r.due_at,
  r.total_minor, r.amount_paid_minor, r.outstanding_minor,
  greatest(floor(extract(epoch FROM (now()-r.due_at))/86400)::integer,0) AS days_past_due,
  CASE
    WHEN r.outstanding_minor <= 0 OR r.status IN ('draft','void','paid') THEN 'not_due'
    WHEN r.due_at >= now() THEN 'current'
    WHEN now()-r.due_at <= interval '30 days' THEN '1_30'
    WHEN now()-r.due_at <= interval '60 days' THEN '31_60'
    WHEN now()-r.due_at <= interval '90 days' THEN '61_90'
    ELSE 'over_90'
  END AS aging_bucket
FROM public.commercial_invoice_receivables r
WHERE r.status <> 'draft';

ALTER VIEW public.commercial_receivables_aging SET (security_invoker=true);
REVOKE ALL ON public.commercial_receivables_aging FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_receivables_aging TO service_role;

-- Period revenue facts are intentionally separate by currency. Invoiced amounts
-- are net of posted credit/debit/write-off adjustments via receivables view.
-- Collected amounts are net allocated cash collections after allocation reversals;
-- unallocated collections remain a separate category and are not revenue here.
CREATE OR REPLACE VIEW public.commercial_revenue_invoice_facts AS
SELECT r.organisation_id, r.account_id, r.subscription_id, r.invoice_id,
  date_trunc('month', r.issued_at) AS period_month, r.currency,
  greatest(r.total_minor + r.debits_minor - r.credits_minor,0) AS net_invoiced_minor,
  r.outstanding_minor, r.credit_balance_minor,
  r.issued_at
FROM (
  SELECT v.id AS invoice_id, v.organisation_id, v.account_id, v.subscription_id,
    v.currency, v.issued_at, v.total_minor, v.outstanding_minor, v.credit_balance_minor,
    v.credits_minor, v.debits_minor
  FROM public.commercial_invoice_receivables v
  WHERE v.status NOT IN ('draft','void') AND v.issued_at IS NOT NULL
) r;

ALTER VIEW public.commercial_revenue_invoice_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_revenue_invoice_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_revenue_invoice_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_revenue_collection_facts AS
SELECT p.organisation_id, p.account_id, a.invoice_id,
  date_trunc('month', p.confirmed_at) AS period_month, p.currency,
  greatest(a.amount_minor-coalesce(ar.reversed_minor,0),0) AS net_collected_minor,
  p.confirmed_at, p.id AS payment_id
FROM public.commercial_payment_transactions p
JOIN public.commercial_payment_allocations a ON a.payment_id=p.id
LEFT JOIN (
  SELECT allocation_id, sum(amount_minor) AS reversed_minor
  FROM public.commercial_payment_allocation_reversals
  GROUP BY allocation_id
) ar ON ar.allocation_id=a.id
WHERE p.confirmed_at IS NOT NULL
  AND p.status IN ('successful','partially_reversed','reversed');

ALTER VIEW public.commercial_revenue_collection_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_revenue_collection_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_revenue_collection_facts TO service_role;

-- Explicitly expose unallocated collections as a separate fact, not as revenue.
CREATE OR REPLACE VIEW public.commercial_revenue_unallocated_facts AS
SELECT organisation_id, account_id, date_trunc('month',confirmed_at) AS period_month,
  currency, sum(unallocated_minor)::numeric(20,0) AS unallocated_minor
FROM public.commercial_unallocated_collections
WHERE confirmed_at IS NOT NULL
GROUP BY organisation_id, account_id, date_trunc('month',confirmed_at), currency;

ALTER VIEW public.commercial_revenue_unallocated_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_revenue_unallocated_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_revenue_unallocated_facts TO service_role;

COMMENT ON VIEW public.commercial_receivables_aging IS
  'CC-07: authoritative invoice receivable aging; currency is retained per row and no FX is applied.';
COMMENT ON VIEW public.commercial_revenue_invoice_facts IS
  'CC-07: issued invoice facts net of posted adjustments; amounts remain currency-specific.';
COMMENT ON VIEW public.commercial_revenue_collection_facts IS
  'CC-07: allocated collections net of allocation reversals; excludes unallocated cash.';


-- CC-07.03: lifecycle-derived revenue movements. Currency is never converted.
CREATE TABLE IF NOT EXISTS public.commercial_subscription_revenue_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.commercial_accounts(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  previous_subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions(id) ON DELETE RESTRICT,
  new_subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('expansion','contraction','unchanged')),
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  previous_mrr_minor numeric(20,0) NOT NULL CHECK (previous_mrr_minor >= 0),
  new_mrr_minor numeric(20,0) NOT NULL CHECK (new_mrr_minor >= 0),
  delta_mrr_minor numeric(20,0) NOT NULL,
  effective_at timestamptz NOT NULL,
  price_resolution_ref text NOT NULL CHECK (length(btrim(price_resolution_ref)) BETWEEN 1 AND 200),
  commercial_acceptance_ref text NOT NULL CHECK (length(btrim(commercial_acceptance_ref)) BETWEEN 1 AND 300),
  financial_adjustment_ref text NOT NULL CHECK (length(btrim(financial_adjustment_ref)) BETWEEN 1 AND 300),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 170),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,idempotency_key),
  UNIQUE (previous_subscription_id),
  UNIQUE (new_subscription_id),
  CHECK (new_subscription_id <> previous_subscription_id),
  CHECK (delta_mrr_minor = new_mrr_minor - previous_mrr_minor),
  CHECK (
    (movement_type='expansion' AND delta_mrr_minor > 0)
    OR (movement_type='contraction' AND delta_mrr_minor < 0)
    OR (movement_type='unchanged' AND delta_mrr_minor = 0)
  )
);
CREATE INDEX IF NOT EXISTS commercial_subscription_revenue_movements_org_time_idx
  ON public.commercial_subscription_revenue_movements(organisation_id,effective_at DESC);
ALTER TABLE public.commercial_subscription_revenue_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_subscription_revenue_movements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_subscription_revenue_movements FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.commercial_subscription_revenue_movements TO service_role;
CREATE POLICY commercial_subscription_revenue_movements_service_role
  ON public.commercial_subscription_revenue_movements
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS commercial_subscription_revenue_movements_immutable
  ON public.commercial_subscription_revenue_movements;
CREATE TRIGGER commercial_subscription_revenue_movements_immutable
  BEFORE UPDATE OR DELETE ON public.commercial_subscription_revenue_movements
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_reconciliation_event_mutation();

-- Atomic founder-only replacement: terminate the old immutable subscription,
-- create a new accepted snapshot, activate it, and record its MRR delta.
CREATE OR REPLACE FUNCTION public.commercial_replace_active_subscription_for_founder(
  _old_subscription_id uuid,
  _plan_code text,
  _plan_version integer,
  _currency text,
  _billing_term text,
  _property_count integer,
  _addon_codes text[],
  _price_resolution_ref text,
  _accepted_price_snapshot jsonb,
  _commercial_acceptance_ref text,
  _financial_adjustment_ref text,
  _period_ends_at timestamptz,
  _idempotency_key text,
  _reason_code text,
  _actor_user_id uuid,
  _actor_organisation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role',true);
  v_old public.commercial_subscriptions%ROWTYPE;
  v_account public.commercial_accounts%ROWTYPE;
  v_founder_org uuid;
  v_new public.commercial_subscriptions%ROWTYPE;
  v_existing public.commercial_subscription_revenue_movements%ROWTYPE;
  v_old_total numeric(20,0);
  v_new_total numeric(20,0);
  v_old_mrr numeric(20,0);
  v_new_mrr numeric(20,0);
  v_delta numeric(20,0);
  v_movement_type text;
  v_now timestamptz := clock_timestamp();
  v_cancel jsonb;
  v_activate jsonb;
  v_create_key text;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  IF _actor_user_id IS NULL OR _actor_organisation_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.commercial_founder_admin_memberships m
      WHERE m.principal_id=_actor_user_id AND m.organisation_id=_actor_organisation_id AND m.status='active'
    ) THEN
    RAISE EXCEPTION 'Verified founder administrator authority is required' USING ERRCODE='42501';
  END IF;
  SELECT founder_organisation_id INTO v_founder_org
    FROM public.commercial_founder_tenant_config WHERE singleton=true;
  IF v_founder_org IS NULL OR v_founder_org IS DISTINCT FROM _actor_organisation_id THEN
    RAISE EXCEPTION 'Founder tenant boundary does not match the verified actor' USING ERRCODE='42501';
  END IF;
  IF _old_subscription_id IS NULL
    OR _plan_code NOT IN ('essential','professional','enterprise')
    OR _plan_version IS NULL OR _plan_version < 1
    OR _currency NOT IN ('TZS','USD')
    OR _billing_term NOT IN ('monthly','annual')
    OR _property_count IS NULL OR _property_count < 1
    OR _price_resolution_ref IS NULL OR length(btrim(_price_resolution_ref)) NOT BETWEEN 1 AND 200
    OR _accepted_price_snapshot IS NULL OR jsonb_typeof(_accepted_price_snapshot)<>'object'
    OR _accepted_price_snapshot->>'currency' IS DISTINCT FROM _currency
    OR _accepted_price_snapshot->>'planCode' IS DISTINCT FROM _plan_code
    OR (_accepted_price_snapshot->>'planVersion')::integer IS DISTINCT FROM _plan_version
    OR _accepted_price_snapshot->>'billingTerm' IS DISTINCT FROM _billing_term
    OR (_accepted_price_snapshot->>'propertyCount')::integer IS DISTINCT FROM _property_count
    OR _accepted_price_snapshot->>'priceCode' IS NULL
    OR coalesce((_accepted_price_snapshot->>'quoteRequired')::boolean,true) IS DISTINCT FROM false
    OR jsonb_typeof(_accepted_price_snapshot->'total')<>'number'
    OR (_accepted_price_snapshot->>'total')::numeric <= 0
    OR jsonb_typeof(_accepted_price_snapshot->'lineItems')<>'array'
    OR jsonb_array_length(_accepted_price_snapshot->'lineItems')=0
    OR to_jsonb(coalesce(_addon_codes,ARRAY[]::text[])) IS DISTINCT FROM _accepted_price_snapshot->'addonCodes'
    OR (coalesce(array_length(_addon_codes,1),0) <> (SELECT count(DISTINCT x) FROM unnest(coalesce(_addon_codes,ARRAY[]::text[])) x))
    OR _commercial_acceptance_ref IS NULL OR length(btrim(_commercial_acceptance_ref)) NOT BETWEEN 1 AND 300
    OR _financial_adjustment_ref IS NULL OR length(btrim(_financial_adjustment_ref)) NOT BETWEEN 1 AND 300
    OR _period_ends_at IS NULL OR _period_ends_at <= v_now
    OR _idempotency_key IS NULL OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 170
    OR _reason_code IS NULL OR length(btrim(_reason_code)) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Invalid accepted subscription replacement contract' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_idempotency_key,0));
  SELECT * INTO v_old FROM public.commercial_subscriptions WHERE id=_old_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription to replace was not found' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_account FROM public.commercial_accounts WHERE id=v_old.account_id FOR UPDATE;
  IF NOT FOUND OR v_account.status<>'active' OR v_account.organisation_id=v_founder_org THEN
    RAISE EXCEPTION 'Active customer commercial account was not found' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_existing FROM public.commercial_subscription_revenue_movements
    WHERE account_id=v_old.account_id AND idempotency_key=_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'replayed',true,'movementId',v_existing.id,
      'subscriptionId',v_existing.new_subscription_id,'movementType',v_existing.movement_type,
      'deltaMrrMinor',v_existing.delta_mrr_minor::text);
  END IF;
  IF v_old.status<>'active' OR v_old.quote_required
    OR v_old.current_period_ends_at IS NULL OR v_old.current_period_ends_at<=v_now THEN
    RAISE EXCEPTION 'Only a current fixed-price paid subscription can be replaced' USING ERRCODE='55000';
  END IF;
  IF v_old.currency IS DISTINCT FROM _currency THEN
    RAISE EXCEPTION 'A subscription replacement cannot change currency; TZS and USD contracts must remain separate' USING ERRCODE='22023';
  END IF;

  v_old_total := (v_old.accepted_price_snapshot->>'total')::numeric;
  v_new_total := (_accepted_price_snapshot->>'total')::numeric;
  v_old_mrr := CASE WHEN v_old.billing_term='monthly' THEN v_old_total ELSE round(v_old_total/12) END;
  v_new_mrr := CASE WHEN _billing_term='monthly' THEN v_new_total ELSE round(v_new_total/12) END;
  v_delta := v_new_mrr-v_old_mrr;
  v_movement_type := CASE WHEN v_delta>0 THEN 'expansion' WHEN v_delta<0 THEN 'contraction' ELSE 'unchanged' END;
  IF v_delta<>0 AND NOT EXISTS (
    SELECT 1
    FROM public.commercial_invoice_adjustments adj
    JOIN public.commercial_invoices inv ON inv.id=adj.invoice_id
    WHERE inv.account_id=v_old.account_id AND inv.subscription_id=v_old.id
      AND inv.currency=v_old.currency AND adj.adjustment_ref=_financial_adjustment_ref
      AND adj.status='posted'
      AND (
        (v_delta>0 AND adj.adjustment_type='debit_note')
        OR (v_delta<0 AND adj.adjustment_type='credit_note')
      )
  ) THEN
    RAISE EXCEPTION 'A posted credit/debit adjustment on the replaced subscription is required for an MRR change'
      USING ERRCODE='55000';
  END IF;
  v_create_key := _idempotency_key || ':create';

  v_cancel := public.commercial_apply_subscription_command(
    v_old.account_id,v_old.id,'cancel_immediately',_idempotency_key||':close',
    _actor_user_id,_actor_organisation_id,'founder_admin','commercial_terms_replaced',NULL,NULL
  );

  INSERT INTO public.commercial_subscriptions(
    account_id,plan_code,plan_version,currency,billing_term,property_count,addon_codes,
    price_resolution_ref,accepted_price_snapshot,quote_required,status,created_by
  ) VALUES (
    v_old.account_id,_plan_code,_plan_version,_currency,_billing_term,_property_count,
    coalesce(_addon_codes,ARRAY[]::text[]),_price_resolution_ref,_accepted_price_snapshot,
    false,'pending_activation',_actor_user_id
  ) RETURNING * INTO v_new;

  INSERT INTO public.commercial_subscription_events(
    account_id,subscription_id,event_type,occurred_at,idempotency_key,actor_user_id,
    actor_organisation_id,actor_role,reason_code,event_metadata
  ) VALUES (
    v_account.id,v_new.id,'created',v_now,v_create_key,_actor_user_id,
    _actor_organisation_id,'founder_admin',_reason_code,
    jsonb_build_object('priceResolutionRef',_price_resolution_ref,'replacementFor',v_old.id,
      'planCode',_plan_code,'planVersion',_plan_version,'currency',_currency,'billingTerm',_billing_term)
  );

  v_activate := public.commercial_apply_subscription_command(
    v_account.id,v_new.id,'activate_paid',_idempotency_key||':activate',
    _actor_user_id,_actor_organisation_id,'founder_admin',_reason_code,
    _commercial_acceptance_ref,_period_ends_at
  );

  INSERT INTO public.commercial_subscription_revenue_movements(
    account_id,organisation_id,previous_subscription_id,new_subscription_id,movement_type,
    currency,previous_mrr_minor,new_mrr_minor,delta_mrr_minor,effective_at,
    price_resolution_ref,commercial_acceptance_ref,financial_adjustment_ref,
    idempotency_key,created_by,evidence
  ) VALUES (
    v_account.id,v_account.organisation_id,v_old.id,v_new.id,v_movement_type,
    _currency,v_old_mrr,v_new_mrr,v_delta,v_now,_price_resolution_ref,
    _commercial_acceptance_ref,_financial_adjustment_ref,_idempotency_key,_actor_user_id,
    jsonb_build_object('reasonCode',_reason_code,'previousBillingTerm',v_old.billing_term,
      'newBillingTerm',_billing_term,'previousPlanCode',v_old.plan_code,'newPlanCode',_plan_code,
      'oldCancellationEventId',v_cancel->>'eventId','newActivationEventId',v_activate->>'eventId')
  ) RETURNING * INTO v_existing;

  INSERT INTO public.commercial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,resource_type,
    resource_ref,outcome,reason_code,metadata
  ) VALUES (
    _idempotency_key,_actor_user_id,_actor_organisation_id,'founder_admin',
    'subscription.commercial_terms_replaced','subscription',v_new.id::text,'succeeded',_reason_code,
    jsonb_build_object('previousSubscriptionId',v_old.id,'newSubscriptionId',v_new.id,
      'movementType',v_movement_type,'previousMrrMinor',v_old_mrr::text,
      'newMrrMinor',v_new_mrr::text,'financialAdjustmentRef',_financial_adjustment_ref)
  );
  RETURN jsonb_build_object('ok',true,'replayed',false,'movementId',v_existing.id,
    'subscriptionId',v_new.id,'movementType',v_movement_type,'deltaMrrMinor',v_delta::text);
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_replace_active_subscription_for_founder(
  uuid,text,integer,text,text,integer,text[],text,jsonb,text,text,timestamptz,text,text,uuid,uuid
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_replace_active_subscription_for_founder(
  uuid,text,integer,text,text,integer,text[],text,jsonb,text,text,timestamptz,text,text,uuid,uuid
) TO service_role;

-- Preserve numeric(20,0) as text at the database boundary. Browser JSON numbers
-- would otherwise lose integer precision above Number.MAX_SAFE_INTEGER.
CREATE OR REPLACE VIEW public.commercial_subscription_recurring_value_facts AS
SELECT s.id AS subscription_id,s.account_id,a.organisation_id,s.currency,s.billing_term,
  (s.accepted_price_snapshot->>'total')::numeric(20,0)::text AS contract_total_minor,
  CASE WHEN s.billing_term='monthly'
    THEN (s.accepted_price_snapshot->>'total')::numeric(20,0)
    ELSE round((s.accepted_price_snapshot->>'total')::numeric/12)
  END::numeric(20,0)::text AS mrr_minor,
  CASE WHEN s.billing_term='monthly'
    THEN ((s.accepted_price_snapshot->>'total')::numeric*12)
    ELSE (s.accepted_price_snapshot->>'total')::numeric
  END::numeric(20,0)::text AS arr_minor,
  s.current_period_starts_at,s.current_period_ends_at
FROM public.commercial_subscriptions s
JOIN public.commercial_accounts a ON a.id=s.account_id
WHERE s.status='active' AND s.quote_required=false
  AND s.current_period_starts_at IS NOT NULL AND s.current_period_ends_at>now();

ALTER VIEW public.commercial_subscription_recurring_value_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_subscription_recurring_value_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_subscription_recurring_value_facts TO service_role;

-- Movement facts distinguish paid acquisition, plan expansion/contraction and
-- genuine paid churn. Trial activation is never included in MRR.
CREATE OR REPLACE VIEW public.commercial_subscription_revenue_movement_facts AS
WITH paid_activations AS (
  SELECT e.account_id,a.organisation_id,e.subscription_id,e.occurred_at AS effective_at,
    s.currency,'new'::text AS movement_type,0::numeric(20,0) AS previous_mrr_minor,
    CASE WHEN s.billing_term='monthly' THEN (s.accepted_price_snapshot->>'total')::numeric(20,0)
      ELSE round((s.accepted_price_snapshot->>'total')::numeric/12) END::numeric(20,0) AS movement_mrr_minor,
    (CASE WHEN s.billing_term='monthly' THEN (s.accepted_price_snapshot->>'total')::numeric(20,0)
      ELSE round((s.accepted_price_snapshot->>'total')::numeric/12) END)::numeric(20,0) AS net_new_mrr_minor
  FROM public.commercial_subscription_events e
  JOIN public.commercial_subscriptions s ON s.id=e.subscription_id
  JOIN public.commercial_accounts a ON a.id=e.account_id
  WHERE e.event_type='activate_paid' AND s.quote_required=false
    AND NOT EXISTS (SELECT 1 FROM public.commercial_subscription_revenue_movements m WHERE m.new_subscription_id=s.id)
),
price_movements AS (
  SELECT m.account_id,m.organisation_id,m.new_subscription_id AS subscription_id,m.effective_at,
    m.currency,m.movement_type,m.previous_mrr_minor,
    abs(m.delta_mrr_minor) AS movement_mrr_minor,
    m.delta_mrr_minor AS net_new_mrr_minor
  FROM public.commercial_subscription_revenue_movements m
  WHERE m.movement_type IN ('expansion','contraction')
),
paid_churn AS (
  SELECT e.account_id,a.organisation_id,e.subscription_id,e.occurred_at AS effective_at,
    s.currency,'churned'::text AS movement_type,
    CASE WHEN s.billing_term='monthly' THEN (s.accepted_price_snapshot->>'total')::numeric(20,0)
      ELSE round((s.accepted_price_snapshot->>'total')::numeric/12) END::numeric(20,0) AS previous_mrr_minor,
    CASE WHEN s.billing_term='monthly' THEN (s.accepted_price_snapshot->>'total')::numeric(20,0)
      ELSE round((s.accepted_price_snapshot->>'total')::numeric/12) END::numeric(20,0) AS movement_mrr_minor,
    -((CASE WHEN s.billing_term='monthly' THEN (s.accepted_price_snapshot->>'total')::numeric(20,0)
      ELSE round((s.accepted_price_snapshot->>'total')::numeric/12) END)::numeric(20,0)) AS net_new_mrr_minor
  FROM public.commercial_subscription_events e
  JOIN public.commercial_subscriptions s ON s.id=e.subscription_id
  JOIN public.commercial_accounts a ON a.id=e.account_id
  WHERE e.event_type IN ('cancel_immediately','expire')
    AND s.current_period_starts_at IS NOT NULL AND s.quote_required=false
    AND NOT EXISTS (SELECT 1 FROM public.commercial_subscription_revenue_movements m WHERE m.previous_subscription_id=s.id)
)
SELECT * FROM paid_activations
UNION ALL SELECT * FROM price_movements
UNION ALL SELECT * FROM paid_churn;

ALTER VIEW public.commercial_subscription_revenue_movement_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_subscription_revenue_movement_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_subscription_revenue_movement_facts TO service_role;

-- One-time, credit, debit/write-off and reversal amounts remain separate
-- financial classifications rather than being hidden inside collected revenue.
CREATE OR REPLACE VIEW public.commercial_revenue_invoice_facts AS
WITH adjustments AS (
  SELECT invoice_id,
    sum(amount_minor) FILTER (WHERE adjustment_type='credit_note' AND status='posted')::numeric(20,0) AS credit_notes_minor,
    sum(amount_minor) FILTER (WHERE adjustment_type='debit_note' AND status='posted')::numeric(20,0) AS debit_notes_minor,
    sum(amount_minor) FILTER (WHERE adjustment_type='write_off' AND status='posted')::numeric(20,0) AS write_offs_minor
  FROM public.commercial_invoice_adjustments GROUP BY invoice_id
), one_time AS (
  SELECT invoice_id,
    sum(amount_minor) FILTER (
      WHERE kind='adjustment' OR line_snapshot->>'chargeModel'='one_time'
        OR line_snapshot->>'billingFrequency'='one_time'
    )::numeric(20,0) AS one_time_minor
  FROM public.commercial_invoice_lines GROUP BY invoice_id
)
SELECT r.organisation_id,r.account_id,r.subscription_id,r.id AS invoice_id,
  date_trunc('month',r.issued_at) AS period_month,r.currency,
  greatest(r.total_minor+coalesce(ad.debit_notes_minor,0)
    -coalesce(ad.credit_notes_minor,0)-coalesce(ad.write_offs_minor,0),0)::numeric(20,0) AS net_invoiced_minor,
  r.outstanding_minor,r.credit_balance_minor,r.issued_at,
  r.total_minor::numeric(20,0) AS gross_invoiced_minor,
  coalesce(ot.one_time_minor,0)::numeric(20,0) AS one_time_minor,
  coalesce(ad.credit_notes_minor,0)::numeric(20,0) AS credit_notes_minor,
  coalesce(ad.debit_notes_minor,0)::numeric(20,0) AS debit_notes_minor,
  coalesce(ad.write_offs_minor,0)::numeric(20,0) AS write_offs_minor
FROM public.commercial_invoice_receivables r
LEFT JOIN adjustments ad ON ad.invoice_id=r.id
LEFT JOIN one_time ot ON ot.invoice_id=r.id
WHERE r.status NOT IN ('draft','void') AND r.issued_at IS NOT NULL;

ALTER VIEW public.commercial_revenue_invoice_facts SET (security_invoker=true);

CREATE OR REPLACE VIEW public.commercial_revenue_reversal_facts AS
SELECT p.organisation_id,p.account_id,date_trunc('month',r.verified_at) AS period_month,
  p.currency,sum(r.amount_minor)::numeric(20,0) AS reversed_minor,count(*)::bigint AS reversal_count
FROM public.commercial_payment_reversals r
JOIN public.commercial_payment_transactions p ON p.id=r.payment_id
GROUP BY p.organisation_id,p.account_id,date_trunc('month',r.verified_at),p.currency;

ALTER VIEW public.commercial_revenue_reversal_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_revenue_reversal_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_revenue_reversal_facts TO service_role;


-- Founder workspace money projections return NUMERIC(20,0) as text to prevent
-- IEEE-754 precision loss in the legacy control-centre UI.
CREATE OR REPLACE VIEW public.commercial_founder_invoice_workspace_facts AS
SELECT r.id,r.organisation_id,r.account_id,r.subscription_id,r.invoice_number,r.currency,
  r.status,r.issued_at,r.due_at,r.total_minor::numeric(20,0)::text AS total_minor,
  r.amount_paid_minor::numeric(20,0)::text AS amount_paid_minor,
  r.outstanding_minor::numeric(20,0)::text AS outstanding_minor,r.is_overdue
FROM public.commercial_invoice_receivables r;
ALTER VIEW public.commercial_founder_invoice_workspace_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_invoice_workspace_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_invoice_workspace_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_founder_payment_workspace_facts AS
SELECT p.id,p.organisation_id,p.account_id,p.invoice_id,p.provider,p.provider_transaction_ref,
  p.amount_minor::numeric(20,0)::text AS amount_minor,p.currency,p.payment_method,p.status,
  p.confirmed_at,p.created_at
FROM public.commercial_payment_transactions p;
ALTER VIEW public.commercial_founder_payment_workspace_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_payment_workspace_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_payment_workspace_facts TO service_role;


-- JSON-safe founder reporting views. Cast every NUMERIC(20,0) amount to text
-- before PostgREST serializes it, preserving exact integer values in JavaScript.
CREATE OR REPLACE VIEW public.commercial_founder_revenue_invoice_facts AS
SELECT organisation_id,account_id,invoice_id,period_month,currency,
  gross_invoiced_minor::numeric(20,0)::text AS gross_invoiced_minor,
  net_invoiced_minor::numeric(20,0)::text AS net_invoiced_minor,
  one_time_minor::numeric(20,0)::text AS one_time_minor,
  credit_notes_minor::numeric(20,0)::text AS credit_notes_minor,
  debit_notes_minor::numeric(20,0)::text AS debit_notes_minor,
  write_offs_minor::numeric(20,0)::text AS write_offs_minor,
  outstanding_minor::numeric(20,0)::text AS outstanding_minor,
  credit_balance_minor::numeric(20,0)::text AS credit_balance_minor
FROM public.commercial_revenue_invoice_facts;
ALTER VIEW public.commercial_founder_revenue_invoice_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_revenue_invoice_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_revenue_invoice_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_founder_revenue_collection_facts AS
SELECT organisation_id,account_id,invoice_id,payment_id,period_month,currency,
  net_collected_minor::numeric(20,0)::text AS net_collected_minor
FROM public.commercial_revenue_collection_facts;
ALTER VIEW public.commercial_founder_revenue_collection_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_revenue_collection_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_revenue_collection_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_founder_revenue_unallocated_facts AS
SELECT organisation_id,account_id,period_month,currency,
  unallocated_minor::numeric(20,0)::text AS unallocated_minor
FROM public.commercial_revenue_unallocated_facts;
ALTER VIEW public.commercial_founder_revenue_unallocated_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_revenue_unallocated_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_revenue_unallocated_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_founder_revenue_reversal_facts AS
SELECT organisation_id,account_id,period_month,currency,
  reversed_minor::numeric(20,0)::text AS reversed_minor,reversal_count
FROM public.commercial_revenue_reversal_facts;
ALTER VIEW public.commercial_founder_revenue_reversal_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_revenue_reversal_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_revenue_reversal_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_founder_receivables_aging AS
SELECT invoice_id,organisation_id,currency,status,aging_bucket,
  outstanding_minor::numeric(20,0)::text AS outstanding_minor
FROM public.commercial_receivables_aging;
ALTER VIEW public.commercial_founder_receivables_aging SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_receivables_aging FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_receivables_aging TO service_role;

CREATE OR REPLACE VIEW public.commercial_founder_subscription_movement_facts AS
SELECT account_id,organisation_id,subscription_id,effective_at,currency,movement_type,
  previous_mrr_minor::numeric(20,0)::text AS previous_mrr_minor,
  movement_mrr_minor::numeric(20,0)::text AS movement_mrr_minor,
  net_new_mrr_minor::numeric(20,0)::text AS net_new_mrr_minor
FROM public.commercial_subscription_revenue_movement_facts;
ALTER VIEW public.commercial_founder_subscription_movement_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_founder_subscription_movement_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_founder_subscription_movement_facts TO service_role;


-- CC-07.02/07.03: detect subscription/ledger and entitlement/subscription drift.
-- These are exception projections only; they never alter invoices or grants.
CREATE OR REPLACE VIEW public.commercial_subscription_invoice_consistency_facts AS
SELECT s.id AS subscription_id,a.id AS account_id,a.organisation_id,
  s.currency,s.status,s.current_period_starts_at,s.current_period_ends_at,
  'missing_current_period_invoice'::text AS exception_type,
  jsonb_build_object('billingTerm',s.billing_term,'periodStart',s.current_period_starts_at,
    'periodEnd',s.current_period_ends_at) AS evidence
FROM public.commercial_subscriptions s
JOIN public.commercial_accounts a ON a.id=s.account_id
WHERE s.status='active' AND s.quote_required=false
  AND s.current_period_starts_at IS NOT NULL AND s.current_period_ends_at>now()
  AND NOT EXISTS (
    SELECT 1 FROM public.commercial_invoices i
    WHERE i.subscription_id=s.id AND i.account_id=s.account_id
      AND i.billing_period_start=s.current_period_starts_at
      AND i.billing_period_end=s.current_period_ends_at
      AND i.status NOT IN ('draft','void')
  )
UNION ALL
SELECT s.id AS subscription_id,a.id AS account_id,a.organisation_id,
  s.currency,s.status,i.billing_period_start,i.billing_period_end,
  'invoice_currency_mismatch'::text AS exception_type,
  jsonb_build_object('invoiceId',i.id,'invoiceCurrency',i.currency,'subscriptionCurrency',s.currency) AS evidence
FROM public.commercial_invoices i
JOIN public.commercial_subscriptions s ON s.id=i.subscription_id AND s.account_id=i.account_id
JOIN public.commercial_accounts a ON a.id=s.account_id
WHERE i.status NOT IN ('draft','void') AND i.currency IS DISTINCT FROM s.currency
UNION ALL
SELECT s.id AS subscription_id,a.id AS account_id,a.organisation_id,
  s.currency,s.status,i.billing_period_start,i.billing_period_end,
  'invoice_billing_term_mismatch'::text AS exception_type,
  jsonb_build_object('invoiceId',i.id,'invoiceBillingTerm',i.billing_term,'subscriptionBillingTerm',s.billing_term) AS evidence
FROM public.commercial_invoices i
JOIN public.commercial_subscriptions s ON s.id=i.subscription_id AND s.account_id=i.account_id
JOIN public.commercial_accounts a ON a.id=s.account_id
WHERE i.status NOT IN ('draft','void') AND i.billing_term IS DISTINCT FROM s.billing_term;

ALTER VIEW public.commercial_subscription_invoice_consistency_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_subscription_invoice_consistency_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_subscription_invoice_consistency_facts TO service_role;

CREATE OR REPLACE VIEW public.commercial_subscription_entitlement_consistency_facts AS
SELECT a.id AS assignment_id,a.organisation_id,a.account_id,a.subscription_id,a.feature_code,
  CASE
    WHEN a.organisation_id IS DISTINCT FROM c.organisation_id THEN 'assignment_tenant_mismatch'
    WHEN a.status='active' AND (a.effective_from>now() OR (a.effective_to IS NOT NULL AND a.effective_to<=now()))
      THEN 'active_assignment_outside_effective_window'
    ELSE 'active_entitlement_on_inactive_subscription'
  END::text AS exception_type,
  jsonb_build_object('assignmentStatus',a.status,'effectiveFrom',a.effective_from,
    'effectiveTo',a.effective_to,'subscriptionStatus',s.status,
    'currentPeriodEndsAt',s.current_period_ends_at,'trialEndsAt',s.trial_ends_at) AS evidence
FROM public.commercial_entitlement_assignments a
JOIN public.commercial_subscriptions s ON s.id=a.subscription_id AND s.account_id=a.account_id
JOIN public.commercial_accounts c ON c.id=a.account_id
WHERE a.organisation_id IS DISTINCT FROM c.organisation_id
  OR (a.status='active' AND (
    a.effective_from>now()
    OR (a.effective_to IS NOT NULL AND a.effective_to<=now())
    OR s.status NOT IN ('active','trialing')
    OR (s.status='active' AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at<=now()))
    OR (s.status='trialing' AND (s.trial_ends_at IS NULL OR s.trial_ends_at<=now()))
  ));

ALTER VIEW public.commercial_subscription_entitlement_consistency_facts SET (security_invoker=true);
REVOKE ALL ON public.commercial_subscription_entitlement_consistency_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_subscription_entitlement_consistency_facts TO service_role;
