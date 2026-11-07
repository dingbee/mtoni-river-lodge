-- CC-04.02 — Durable subscription invoices, collections and reconciliation ledger.
-- Additive, tenant-scoped financial schema. Never touches hospitality bookings/payments.
-- No production execution, credentials, prices, tax rates, FX rates or seed records.

CREATE SEQUENCE IF NOT EXISTS public.commercial_invoice_number_seq;

CREATE TABLE IF NOT EXISTS public.commercial_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('pesapal','bank_transfer','manual')),
  provider_account_ref text NOT NULL CHECK (length(btrim(provider_account_ref)) BETWEEN 1 AND 200),
  credential_secret_ref text NOT NULL CHECK (length(btrim(credential_secret_ref)) BETWEEN 1 AND 200),
  supported_currencies text[] NOT NULL CHECK (cardinality(supported_currencies) > 0 AND supported_currencies <@ ARRAY['TZS','USD']::text[]),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, provider, provider_account_ref),
  UNIQUE (id, organisation_id)
);
COMMENT ON COLUMN public.commercial_provider_accounts.credential_secret_ref IS
  'Reference to server-side secret storage only. Never store provider credentials in this table.';

CREATE TABLE IF NOT EXISTS public.commercial_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.commercial_accounts(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  invoice_number text NOT NULL UNIQUE,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  billing_term text NOT NULL CHECK (billing_term IN ('monthly','annual')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void')),
  issued_at timestamptz,
  due_at timestamptz,
  subtotal_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  tax_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  discount_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  amount_paid_minor numeric(20,0) NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  pricing_snapshot jsonb NOT NULL CHECK (jsonb_typeof(pricing_snapshot) = 'object'),
  tax_snapshot jsonb NOT NULL CHECK (jsonb_typeof(tax_snapshot) = 'object'),
  discount_snapshot jsonb NOT NULL DEFAULT '{"amountMinor":0,"policyRef":"none"}'::jsonb,
  issued_snapshot jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_invoice_subscription_account_fk
    FOREIGN KEY (subscription_id, account_id)
    REFERENCES public.commercial_subscriptions(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT commercial_invoice_period_valid CHECK (billing_period_end > billing_period_start),
  CONSTRAINT commercial_invoice_amounts_valid CHECK (
    total_minor = subtotal_minor + tax_minor - discount_minor
    AND discount_minor <= subtotal_minor
    AND amount_paid_minor <= total_minor
  ),
  CONSTRAINT commercial_invoice_issue_dates CHECK (
    (status = 'draft' AND issued_at IS NULL AND due_at IS NULL)
    OR (status <> 'draft' AND issued_at IS NOT NULL AND due_at IS NOT NULL AND due_at >= issued_at)
  ),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (subscription_id, billing_period_start, billing_period_end),
  UNIQUE (id, organisation_id, account_id, currency)
);
CREATE INDEX IF NOT EXISTS commercial_invoices_org_due_idx
  ON public.commercial_invoices(organisation_id, due_at, status);
CREATE INDEX IF NOT EXISTS commercial_invoices_subscription_period_idx
  ON public.commercial_invoices(subscription_id, billing_period_start DESC);

CREATE TABLE IF NOT EXISTS public.commercial_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.commercial_invoices(id) ON DELETE RESTRICT,
  line_ref text NOT NULL CHECK (length(btrim(line_ref)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('plan_base','additional_property','addon','adjustment')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 300),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount_minor numeric(20,0) NOT NULL CHECK (unit_amount_minor >= 0),
  amount_minor numeric(20,0) NOT NULL CHECK (amount_minor >= 0),
  line_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, line_ref)
);
CREATE INDEX IF NOT EXISTS commercial_invoice_lines_invoice_idx
  ON public.commercial_invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS public.commercial_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  account_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  provider_account_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('pesapal','bank_transfer','manual')),
  provider_order_ref text,
  provider_transaction_ref text,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  amount_minor numeric(20,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  payment_method text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','successful','failed','cancelled','partially_reversed','reversed')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  provider_verified_at timestamptz,
  verification_source text CHECK (verification_source IS NULL OR verification_source IN ('server_provider_query','authorized_manual_verification','bank_statement_reconciliation')),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (invoice_id, organisation_id, account_id, currency)
    REFERENCES public.commercial_invoices(id, organisation_id, account_id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (provider_account_id, organisation_id)
    REFERENCES public.commercial_provider_accounts(id, organisation_id) ON DELETE RESTRICT,
  UNIQUE (account_id, idempotency_key),
  UNIQUE (provider, provider_transaction_ref),
  UNIQUE (id, invoice_id, organisation_id, currency)
);
CREATE INDEX IF NOT EXISTS commercial_payment_invoice_idx
  ON public.commercial_payment_transactions(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_payment_provider_order_idx
  ON public.commercial_payment_transactions(provider, provider_order_ref);

CREATE TABLE IF NOT EXISTS public.commercial_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  amount_minor numeric(20,0) NOT NULL CHECK (amount_minor > 0),
  settlement_ref text NOT NULL CHECK (length(btrim(settlement_ref)) BETWEEN 1 AND 200),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (payment_id, invoice_id, organisation_id, currency)
    REFERENCES public.commercial_payment_transactions(id, invoice_id, organisation_id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (invoice_id, organisation_id)
    REFERENCES public.commercial_invoices(id, organisation_id) ON DELETE RESTRICT,
  UNIQUE (payment_id),
  UNIQUE (idempotency_key),
  UNIQUE (settlement_ref)
);
CREATE INDEX IF NOT EXISTS commercial_payment_allocations_invoice_idx
  ON public.commercial_payment_allocations(invoice_id, allocated_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.commercial_payment_transactions(id) ON DELETE RESTRICT,
  provider_reversal_ref text NOT NULL CHECK (length(btrim(provider_reversal_ref)) BETWEEN 1 AND 200),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  amount_minor numeric(20,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) BETWEEN 1 AND 120),
  verified_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_reversal_ref),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.commercial_invoice_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.commercial_invoices(id) ON DELETE RESTRICT,
  adjustment_ref text NOT NULL UNIQUE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('credit_note','debit_note','write_off')),
  amount_minor numeric(20,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  approval_ref text NOT NULL CHECK (length(btrim(approval_ref)) BETWEEN 1 AND 200),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.commercial_provider_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  provider_account_id uuid NOT NULL REFERENCES public.commercial_provider_accounts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('pesapal','bank_transfer','manual')),
  provider_event_ref text NOT NULL,
  provider_order_ref text,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL CHECK (jsonb_typeof(raw_payload) = 'object'),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','mismatch','rejected')),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_ref)
);

CREATE TABLE IF NOT EXISTS public.commercial_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  provider_account_id uuid REFERENCES public.commercial_provider_accounts(id) ON DELETE RESTRICT,
  currency text NOT NULL CHECK (currency IN ('TZS','USD')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','discrepancy')),
  source_ref text NOT NULL,
  started_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);
CREATE TABLE IF NOT EXISTS public.commercial_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.commercial_reconciliation_runs(id) ON DELETE RESTRICT,
  item_type text NOT NULL CHECK (item_type IN ('matched','missing_internal','missing_provider','duplicate','amount_mismatch','currency_mismatch','unallocated','reversed')),
  internal_payment_id uuid REFERENCES public.commercial_payment_transactions(id) ON DELETE RESTRICT,
  provider_ref text,
  expected_amount_minor numeric(20,0),
  observed_amount_minor numeric(20,0),
  expected_currency text CHECK (expected_currency IS NULL OR expected_currency IN ('TZS','USD')),
  observed_currency text CHECK (observed_currency IS NULL OR observed_currency IN ('TZS','USD')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status text NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved','reviewed','resolved')),
  resolution_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_financial_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('founder_admin','tenant_admin','service_principal')),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_ref text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('succeeded','denied','failed')),
  reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Every financial table is inaccessible directly to tenant/browser roles.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commercial_provider_accounts','commercial_invoices','commercial_invoice_lines',
    'commercial_payment_transactions','commercial_payment_allocations',
    'commercial_payment_reversals','commercial_invoice_adjustments',
    'commercial_provider_notifications','commercial_reconciliation_runs',
    'commercial_reconciliation_items','commercial_financial_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_role_all', t);
  END LOOP;
END;
$rls$;
REVOKE ALL ON SEQUENCE public.commercial_invoice_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.commercial_invoice_number_seq TO service_role;

-- Financial evidence is append-only. Mutable status columns are updated only
-- through the narrowly scoped SECURITY DEFINER settlement functions below.
CREATE OR REPLACE FUNCTION public.guard_commercial_financial_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Commercial financial history is append-only; use a compensating event'
    USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_commercial_financial_append_only() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_payment_allocations_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_financial_append_only();
CREATE TRIGGER commercial_payment_reversals_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_payment_reversals
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_financial_append_only();
CREATE TRIGGER commercial_financial_audit_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_financial_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_financial_append_only();

CREATE OR REPLACE FUNCTION public.guard_commercial_issued_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
BEGIN
  IF OLD.status <> 'draft' AND ROW(
    NEW.organisation_id, NEW.account_id, NEW.subscription_id, NEW.invoice_number,
    NEW.billing_period_start, NEW.billing_period_end, NEW.currency, NEW.billing_term,
    NEW.subtotal_minor, NEW.tax_minor, NEW.discount_minor, NEW.total_minor,
    NEW.pricing_snapshot, NEW.tax_snapshot, NEW.discount_snapshot, NEW.issued_snapshot
  ) IS DISTINCT FROM ROW(
    OLD.organisation_id, OLD.account_id, OLD.subscription_id, OLD.invoice_number,
    OLD.billing_period_start, OLD.billing_period_end, OLD.currency, OLD.billing_term,
    OLD.subtotal_minor, OLD.tax_minor, OLD.discount_minor, OLD.total_minor,
    OLD.pricing_snapshot, OLD.tax_snapshot, OLD.discount_snapshot, OLD.issued_snapshot
  ) THEN
    RAISE EXCEPTION 'Issued invoice financial snapshot is immutable; use an adjustment or credit note'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Issued invoices cannot return to draft' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_commercial_issued_invoice() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER commercial_invoice_snapshot_immutable
  BEFORE UPDATE ON public.commercial_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_issued_invoice();

CREATE OR REPLACE FUNCTION public.guard_commercial_invoice_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.commercial_invoices WHERE id = COALESCE(OLD.invoice_id, NEW.invoice_id);
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Invoice lines are immutable after issue' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_commercial_invoice_line() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER commercial_invoice_line_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_invoice_line();

CREATE OR REPLACE FUNCTION public.commercial_create_invoice_from_subscription(
  _subscription_id uuid,
  _period_start timestamptz,
  _period_end timestamptz,
  _due_at timestamptz,
  _idempotency_key text,
  _tax_snapshot jsonb,
  _discount_snapshot jsonb DEFAULT '{"amountMinor":0,"policyRef":"none"}'::jsonb,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_sub public.commercial_subscriptions%ROWTYPE;
  v_org uuid;
  v_currency text;
  v_lines jsonb;
  v_line jsonb;
  v_subtotal numeric(20,0) := 0;
  v_tax numeric(20,0);
  v_discount numeric(20,0);
  v_total numeric(20,0);
  v_invoice_id uuid;
  v_invoice_number text;
  v_count integer := 0;
  v_line_amount numeric(20,0);
  v_line_qty integer;
  v_line_ref text;
  v_tax_treatment text;
  v_tax_ref text;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _period_start IS NULL OR _period_end <= _period_start OR _due_at IS NULL
    OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid billing period, due date or idempotency key' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_tax_snapshot) <> 'object' OR jsonb_typeof(_discount_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Explicit tax and discount snapshots are required' USING ERRCODE = '22023';
  END IF;
  v_tax_treatment := _tax_snapshot->>'treatment';
  v_tax_ref := _tax_snapshot->>'policyRef';
  IF v_tax_treatment NOT IN ('not_applicable','exempt','inclusive','exclusive')
    OR coalesce(length(btrim(v_tax_ref)),0) = 0
    OR coalesce(_tax_snapshot->>'currency','') NOT IN ('TZS','USD') THEN
    RAISE EXCEPTION 'An explicit, auditable tax treatment and currency are required' USING ERRCODE = '22023';
  END IF;
  v_tax := coalesce((_tax_snapshot->>'amountMinor')::numeric, -1);
  v_discount := coalesce((_discount_snapshot->>'amountMinor')::numeric, -1);
  IF v_tax < 0 OR v_discount < 0 OR coalesce(length(btrim(_discount_snapshot->>'policyRef')),0) = 0 THEN
    RAISE EXCEPTION 'Invalid tax or discount amount/policy reference' USING ERRCODE = '22023';
  END IF;
  IF v_tax_treatment IN ('not_applicable','exempt') AND v_tax <> 0 THEN
    RAISE EXCEPTION 'Exempt/not-applicable tax treatment requires an explicit zero tax amount' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_sub
  FROM public.commercial_subscriptions s
  WHERE s.id = _subscription_id
  FOR UPDATE;
  IF NOT FOUND OR v_sub.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active paid subscription can be invoiced' USING ERRCODE = '55000';
  END IF;
  SELECT organisation_id INTO v_org FROM public.commercial_accounts WHERE id = v_sub.account_id AND status = 'active';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Active commercial account not found' USING ERRCODE = '55000'; END IF;
  v_currency := v_sub.currency;
  IF _tax_snapshot->>'currency' <> v_currency THEN
    RAISE EXCEPTION 'Tax snapshot currency must match subscription currency' USING ERRCODE = '22023';
  END IF;
  IF v_sub.quote_required THEN
    RAISE EXCEPTION 'Enterprise quote-required subscription needs an accepted fixed-value agreement before invoicing' USING ERRCODE = '55000';
  END IF;
  IF v_sub.accepted_price_snapshot->>'currency' IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'Accepted price snapshot currency mismatch' USING ERRCODE = '22023';
  END IF;
  v_lines := coalesce(v_sub.accepted_price_snapshot->'lines', v_sub.accepted_price_snapshot->'lineItems');
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Accepted commercial price snapshot has no invoiceable line items' USING ERRCODE = '55000';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_line_amount := (v_line->>'amountMinor')::numeric;
    v_line_qty := (v_line->>'quantity')::integer;
    v_line_ref := coalesce(v_line->>'code', v_line->>'lineRef');
    IF v_line_amount < 0 OR v_line_qty < 1 OR coalesce(length(btrim(v_line_ref)),0) = 0 THEN
      RAISE EXCEPTION 'Accepted price line is invalid' USING ERRCODE = '22023';
    END IF;
    v_subtotal := v_subtotal + v_line_amount;
    v_count := v_count + 1;
  END LOOP;
  IF v_subtotal <= 0 OR v_subtotal > 99999999999999999999 THEN
    RAISE EXCEPTION 'Accepted price total is invalid' USING ERRCODE = '22023';
  END IF;
  IF coalesce((v_sub.accepted_price_snapshot->>'totalAmountMinor')::numeric,
              (v_sub.accepted_price_snapshot->>'total')::numeric, v_subtotal) <> v_subtotal THEN
    RAISE EXCEPTION 'Accepted price snapshot total does not equal line item sum' USING ERRCODE = '22023';
  END IF;
  IF v_discount > v_subtotal THEN RAISE EXCEPTION 'Discount exceeds invoice subtotal' USING ERRCODE = '22023'; END IF;
  v_total := v_subtotal + CASE WHEN v_tax_treatment = 'exclusive' THEN v_tax ELSE 0 END - v_discount;

  SELECT id INTO v_invoice_id FROM public.commercial_invoices
  WHERE account_id = v_sub.account_id AND idempotency_key = _idempotency_key;
  IF v_invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('invoiceId',v_invoice_id,'replayed',true);
  END IF;
  v_invoice_number := 'SN-' || to_char(now() AT TIME ZONE 'UTC','YYYY') || '-' ||
    lpad(nextval('public.commercial_invoice_number_seq')::text,8,'0');
  INSERT INTO public.commercial_invoices(
    organisation_id, account_id, subscription_id, invoice_number, idempotency_key,
    billing_period_start, billing_period_end, currency, billing_term, status,
    issued_at, due_at, subtotal_minor, tax_minor, discount_minor, total_minor,
    pricing_snapshot, tax_snapshot, discount_snapshot, issued_snapshot, created_by
  ) VALUES (
    v_org, v_sub.account_id, v_sub.id, v_invoice_number, _idempotency_key,
    _period_start, _period_end, v_currency, v_sub.billing_term, 'issued',
    now(), _due_at, v_subtotal, v_tax, v_discount, v_total,
    v_sub.accepted_price_snapshot, _tax_snapshot, _discount_snapshot,
    jsonb_build_object('planCode',v_sub.plan_code,'planVersion',v_sub.plan_version,
      'currency',v_currency,'billingTerm',v_sub.billing_term,'periodStart',_period_start,
      'periodEnd',_period_end,'lines',v_lines,'subtotalMinor',v_subtotal,
      'tax',_tax_snapshot,'discount',_discount_snapshot,'totalMinor',v_total),
    _actor_user_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    INSERT INTO public.commercial_invoice_lines(
      invoice_id,line_ref,kind,description,quantity,unit_amount_minor,amount_minor,line_snapshot
    ) VALUES (
      v_invoice_id,
      coalesce(v_line->>'code',v_line->>'lineRef'),
      CASE WHEN v_line->>'kind' IN ('plan_base','additional_property','addon','adjustment')
        THEN v_line->>'kind' ELSE 'adjustment' END,
      coalesce(v_line->>'description',v_line->>'code',v_line->>'lineRef','Subscription charge'),
      (v_line->>'quantity')::integer,
      (v_line->>'unitAmountMinor')::numeric,
      (v_line->>'amountMinor')::numeric,
      v_line
    );
  END LOOP;

  INSERT INTO public.commercial_financial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,resource_type,
    resource_ref,outcome,metadata
  ) VALUES (
    _idempotency_key,_actor_user_id,v_org,'founder_admin','invoice.issued',
    'invoice',v_invoice_id::text,'succeeded',
    jsonb_build_object('invoiceNumber',v_invoice_number,'currency',v_currency,'totalMinor',v_total)
  );
  RETURN jsonb_build_object('invoiceId',v_invoice_id,'invoiceNumber',v_invoice_number,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_create_invoice_from_subscription(uuid,timestamptz,timestamptz,timestamptz,text,jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_create_invoice_from_subscription(uuid,timestamptz,timestamptz,timestamptz,text,jsonb,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_create_payment_attempt(
  _invoice_id uuid, _provider_account_id uuid, _amount_minor numeric,
  _currency text, _idempotency_key text, _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role',true); v_invoice public.commercial_invoices%ROWTYPE;
  v_provider public.commercial_provider_accounts%ROWTYPE; v_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_invoice FROM public.commercial_invoices WHERE id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status NOT IN ('issued','partially_paid','overdue') THEN
    RAISE EXCEPTION 'Invoice is not payable' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_provider FROM public.commercial_provider_accounts
    WHERE id=_provider_account_id AND organisation_id=v_invoice.organisation_id AND status='active'
      AND _currency=ANY(supported_currencies);
  IF NOT FOUND THEN RAISE EXCEPTION 'Active tenant provider account/currency configuration not found' USING ERRCODE='55000'; END IF;
  IF _currency <> v_invoice.currency OR _amount_minor <= 0 OR _amount_minor > v_invoice.total_minor-v_invoice.amount_paid_minor
    OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Payment amount, currency or idempotency key is invalid' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_id FROM public.commercial_payment_transactions
    WHERE account_id=v_invoice.account_id AND idempotency_key=_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.commercial_payment_transactions(
    organisation_id,account_id,invoice_id,provider_account_id,provider,amount_minor,currency,
    idempotency_key,status,created_by
  ) VALUES (
    v_invoice.organisation_id,v_invoice.account_id,v_invoice.id,v_provider.id,v_provider.provider,
    _amount_minor,_currency,_idempotency_key,'pending',_actor_user_id
  ) RETURNING id INTO v_id;
  INSERT INTO public.commercial_financial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,resource_type,resource_ref,outcome
  ) VALUES (_idempotency_key,_actor_user_id,v_invoice.organisation_id,'tenant_admin',
    'payment.initiated','payment',v_id::text,'succeeded');
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_create_payment_attempt(uuid,uuid,numeric,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_create_payment_attempt(uuid,uuid,numeric,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_confirm_and_allocate_payment(
  _payment_id uuid, _provider_transaction_ref text, _verified_amount_minor numeric,
  _currency text, _verification_source text, _settlement_ref text, _idempotency_key text,
  _verified_at timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role',true);
  v_payment public.commercial_payment_transactions%ROWTYPE;
  v_invoice public.commercial_invoices%ROWTYPE;
  v_allocation uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_payment FROM public.commercial_payment_transactions WHERE id=_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_payment.status IN ('successful','partially_reversed','reversed') THEN
    SELECT id INTO v_allocation FROM public.commercial_payment_allocations WHERE payment_id=v_payment.id;
    IF v_allocation IS NOT NULL THEN RETURN jsonb_build_object('allocationId',v_allocation,'replayed',true); END IF;
  END IF;
  IF v_payment.status <> 'pending' THEN RAISE EXCEPTION 'Payment attempt is not pending' USING ERRCODE='55000'; END IF;
  IF _verification_source NOT IN ('server_provider_query','authorized_manual_verification','bank_statement_reconciliation')
    OR _verified_amount_minor <> v_payment.amount_minor OR _currency <> v_payment.currency
    OR coalesce(length(btrim(_provider_transaction_ref)),0)=0
    OR coalesce(length(btrim(_settlement_ref)),0)=0
    OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Verified payment evidence does not match expected amount, currency or provenance' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_invoice FROM public.commercial_invoices WHERE id=v_payment.invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status IN ('draft','void','paid')
    OR v_invoice.currency <> v_payment.currency
    OR v_payment.amount_minor > v_invoice.total_minor-v_invoice.amount_paid_minor THEN
    RAISE EXCEPTION 'Invoice cannot accept this allocation or payment exceeds outstanding balance' USING ERRCODE='55000';
  END IF;
  UPDATE public.commercial_payment_transactions SET
    status='successful',provider_transaction_ref=_provider_transaction_ref,
    confirmed_at=_verified_at,provider_verified_at=_verified_at,
    verification_source=_verification_source,updated_at=now()
  WHERE id=v_payment.id;
  INSERT INTO public.commercial_payment_allocations(
    payment_id,invoice_id,organisation_id,currency,amount_minor,settlement_ref,idempotency_key
  ) VALUES (
    v_payment.id,v_invoice.id,v_invoice.organisation_id,v_invoice.currency,
    v_payment.amount_minor,_settlement_ref,_idempotency_key
  ) RETURNING id INTO v_allocation;
  UPDATE public.commercial_invoices SET
    amount_paid_minor=amount_paid_minor+v_payment.amount_minor,
    status=CASE WHEN amount_paid_minor+v_payment.amount_minor=total_minor THEN 'paid' ELSE 'partially_paid' END,
    updated_at=now()
  WHERE id=v_invoice.id;
  INSERT INTO public.commercial_financial_audit_events(
    request_id,actor_organisation_id,actor_role,action,resource_type,resource_ref,outcome,metadata
  ) VALUES (_idempotency_key,v_invoice.organisation_id,'service_principal','payment.allocated',
    'payment_allocation',v_allocation::text,'succeeded',
    jsonb_build_object('invoiceId',v_invoice.id,'amountMinor',v_payment.amount_minor,'currency',v_payment.currency));
  RETURN jsonb_build_object('allocationId',v_allocation,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_confirm_and_allocate_payment(uuid,text,numeric,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_confirm_and_allocate_payment(uuid,text,numeric,text,text,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_record_payment_reversal(
  _payment_id uuid, _provider_reversal_ref text, _amount_minor numeric,
  _currency text, _reason_code text, _idempotency_key text,
  _verified_at timestamptz DEFAULT now(), _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role',true);
  v_payment public.commercial_payment_transactions%ROWTYPE;
  v_allocation public.commercial_payment_allocations%ROWTYPE;
  v_invoice public.commercial_invoices%ROWTYPE;
  v_reversed numeric(20,0); v_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_payment FROM public.commercial_payment_transactions WHERE id=_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.status NOT IN ('successful','partially_reversed') THEN
    RAISE EXCEPTION 'Payment is not eligible for reversal' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_allocation FROM public.commercial_payment_allocations WHERE payment_id=v_payment.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original payment allocation not found' USING ERRCODE='55000'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO v_reversed FROM public.commercial_payment_reversals WHERE payment_id=v_payment.id;
  IF _currency <> v_payment.currency OR _amount_minor <= 0 OR v_reversed+_amount_minor > v_allocation.amount_minor
    OR coalesce(length(btrim(_provider_reversal_ref)),0)=0 OR coalesce(length(btrim(_reason_code)),0)=0 THEN
    RAISE EXCEPTION 'Reversal amount, currency or reference is invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_invoice FROM public.commercial_invoices WHERE id=v_payment.invoice_id FOR UPDATE;
  INSERT INTO public.commercial_payment_reversals(
    payment_id,provider_reversal_ref,idempotency_key,amount_minor,currency,reason_code,verified_at,created_by
  ) VALUES (_payment_id,_provider_reversal_ref,_idempotency_key,_amount_minor,_currency,_reason_code,_verified_at,_actor_user_id)
  RETURNING id INTO v_id;
  UPDATE public.commercial_invoices SET
    amount_paid_minor=amount_paid_minor-_amount_minor,
    status=CASE WHEN amount_paid_minor-_amount_minor=0 THEN 'issued'
      WHEN amount_paid_minor-_amount_minor<total_minor THEN 'partially_paid' ELSE status END,
    updated_at=now()
  WHERE id=v_invoice.id;
  UPDATE public.commercial_payment_transactions SET
    status=CASE WHEN v_reversed+_amount_minor=v_allocation.amount_minor THEN 'reversed' ELSE 'partially_reversed' END,
    updated_at=now()
  WHERE id=_payment_id;
  INSERT INTO public.commercial_financial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,resource_type,resource_ref,outcome,reason_code,metadata
  ) VALUES (_idempotency_key,_actor_user_id,v_invoice.organisation_id,'founder_admin',
    'payment.reversed','payment_reversal',v_id::text,'succeeded',_reason_code,
    jsonb_build_object('paymentId',_payment_id,'amountMinor',_amount_minor,'currency',_currency));
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_record_payment_reversal(uuid,text,numeric,text,text,text,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_record_payment_reversal(uuid,text,numeric,text,text,text,timestamptz,uuid) TO service_role;

CREATE OR REPLACE VIEW public.commercial_invoice_receivables AS
SELECT i.id,i.organisation_id,i.account_id,i.subscription_id,i.invoice_number,i.currency,
  i.status,i.issued_at,i.due_at,i.subtotal_minor,i.tax_minor,i.discount_minor,i.total_minor,
  i.amount_paid_minor,
  coalesce(sum(CASE WHEN a.status='posted' AND a.adjustment_type='credit_note' THEN a.amount_minor
    WHEN a.status='posted' AND a.adjustment_type='write_off' THEN a.amount_minor ELSE 0 END),0) AS credits_minor,
  coalesce(sum(CASE WHEN a.status='posted' AND a.adjustment_type='debit_note' THEN a.amount_minor ELSE 0 END),0) AS debits_minor,
  greatest(i.total_minor + coalesce(sum(CASE WHEN a.status='posted' AND a.adjustment_type='debit_note' THEN a.amount_minor ELSE 0 END),0)
    - coalesce(sum(CASE WHEN a.status='posted' AND a.adjustment_type IN ('credit_note','write_off') THEN a.amount_minor ELSE 0 END),0)
    - i.amount_paid_minor,0) AS outstanding_minor,
  CASE WHEN i.due_at < now() AND i.amount_paid_minor < i.total_minor AND i.status NOT IN ('void','paid') THEN true ELSE false END AS is_overdue
FROM public.commercial_invoices i
LEFT JOIN public.commercial_invoice_adjustments a ON a.invoice_id=i.id
GROUP BY i.id;

ALTER VIEW public.commercial_invoice_receivables SET (security_invoker = true);
REVOKE ALL ON public.commercial_invoice_receivables FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_invoice_receivables TO service_role;

COMMENT ON TABLE public.commercial_invoices IS 'StayNas subscription invoices; separate from hospitality booking invoices and guest payments.';
COMMENT ON TABLE public.commercial_payment_transactions IS 'Commercial subscription payment attempts and verified collection state. Never reused for bookings.';
COMMENT ON TABLE public.commercial_payment_allocations IS 'Append-only successful collection allocations to commercial invoices.';
COMMENT ON TABLE public.commercial_reconciliation_items IS 'Append-only discrepancy evidence; resolution never rewrites original payment history.';
