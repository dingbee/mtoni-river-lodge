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
DECLARE v_role text := current_setting('request.jwt.claim.role', true); v_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _event_type NOT IN ('opened','review_started','evidence_added','resolved','reopened','escalated')
    OR _actor_role NOT IN ('founder_admin','service_principal')
    OR length(btrim(coalesce(_reason_code,''))) NOT BETWEEN 2 AND 120
    OR jsonb_typeof(_evidence) IS DISTINCT FROM 'object'
    OR (_event_type='resolved' AND nullif(btrim(_resolution_ref),'') IS NULL) THEN
    RAISE EXCEPTION 'Invalid reconciliation lifecycle event' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commercial_reconciliation_items WHERE id=_item_id) THEN
    RAISE EXCEPTION 'Reconciliation exception not found' USING ERRCODE = 'P0002';
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
    OR (_observed_amount_minor IS NOT NULL AND _observed_amount_minor < 0) THEN
    RAISE EXCEPTION 'Invalid reconciliation item' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.commercial_reconciliation_items(
    run_id,item_type,internal_payment_id,provider_ref,expected_amount_minor,
    observed_amount_minor,expected_currency,observed_currency,evidence
  ) VALUES (
    _run_id,_item_type,_internal_payment_id,_provider_ref,_expected_amount_minor,
    _observed_amount_minor,_expected_currency,_observed_currency,_evidence
  ) RETURNING id INTO v_item_id;
  INSERT INTO public.commercial_reconciliation_item_events(
    item_id,event_type,actor_user_id,actor_role,reason_code,evidence
  ) VALUES (
    v_item_id,'opened',_actor_user_id,'founder_admin','reconciliation_exception_opened',_evidence
  );
  RETURN v_item_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_create_reconciliation_item(uuid,text,uuid,text,numeric,numeric,text,text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_create_reconciliation_item(uuid,text,uuid,text,numeric,numeric,text,text,jsonb,uuid)
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
    WHERE id=_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation item not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_run FROM public.commercial_reconciliation_runs
    WHERE id=v_item.run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status='completed' THEN
    RAISE EXCEPTION 'Completed reconciliation evidence cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF v_item.resolution_status='resolved' THEN
    IF v_item.resolution_ref IS DISTINCT FROM _resolution_ref THEN
      RAISE EXCEPTION 'Conflicting reconciliation resolution replay' USING ERRCODE = '23505';
    END IF;
    RETURN v_item.id;
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
  IF v_run.status <> 'open' THEN
    RETURN jsonb_build_object('runId',v_run.id,'status',v_run.status,'replayed',true);
  END IF;
  SELECT count(*) INTO v_unresolved
  FROM public.commercial_reconciliation_items
  WHERE run_id=_run_id AND resolution_status <> 'resolved';
  v_status := CASE WHEN v_unresolved > 0 THEN 'discrepancy' ELSE 'completed' END;
  UPDATE public.commercial_reconciliation_runs
    SET status=v_status,completed_at=now()
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
