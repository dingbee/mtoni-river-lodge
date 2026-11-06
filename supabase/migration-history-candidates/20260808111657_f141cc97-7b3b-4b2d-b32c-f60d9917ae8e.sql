
CREATE TABLE public.restaurant_daily_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'TZS',
  opening_float numeric(14,2) NOT NULL DEFAULT 0,
  service_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  declared_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  declared_variance numeric(14,2) NOT NULL DEFAULT 0,
  exceptions_open integer NOT NULL DEFAULT 0,
  notes text,
  declared_by uuid,
  declared_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  reopen_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX restaurant_daily_closes_unique
  ON public.restaurant_daily_closes (tenant_id, business_date, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX restaurant_daily_closes_date_idx ON public.restaurant_daily_closes (tenant_id, business_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_daily_closes TO authenticated;
GRANT ALL ON public.restaurant_daily_closes TO service_role;
ALTER TABLE public.restaurant_daily_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily closes read" ON public.restaurant_daily_closes FOR SELECT TO authenticated
  USING (restaurant_can_read(tenant_id));
CREATE POLICY "daily closes write" ON public.restaurant_daily_closes FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));
CREATE TRIGGER restaurant_daily_closes_updated_at BEFORE UPDATE ON public.restaurant_daily_closes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.restaurant_tender_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  close_id uuid NOT NULL REFERENCES public.restaurant_daily_closes(id) ON DELETE CASCADE,
  method text NOT NULL,
  system_amount numeric(14,2) NOT NULL DEFAULT 0,
  declared_amount numeric(14,2) NOT NULL DEFAULT 0,
  variance numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  notes text,
  declared_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (close_id, method)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tender_declarations TO authenticated;
GRANT ALL ON public.restaurant_tender_declarations TO service_role;
ALTER TABLE public.restaurant_tender_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tender declarations read" ON public.restaurant_tender_declarations FOR SELECT TO authenticated
  USING (restaurant_can_read(tenant_id));
CREATE POLICY "tender declarations write" ON public.restaurant_tender_declarations FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));
CREATE TRIGGER restaurant_tender_declarations_updated_at BEFORE UPDATE ON public.restaurant_tender_declarations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.restaurant_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  business_date date NOT NULL,
  scope text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  exceptions_opened integer NOT NULL DEFAULT 0,
  exceptions_existing integer NOT NULL DEFAULT 0,
  run_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX restaurant_reconciliation_runs_idx ON public.restaurant_reconciliation_runs (tenant_id, business_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_reconciliation_runs TO authenticated;
GRANT ALL ON public.restaurant_reconciliation_runs TO service_role;
ALTER TABLE public.restaurant_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reconciliation runs read" ON public.restaurant_reconciliation_runs FOR SELECT TO authenticated
  USING (restaurant_can_read(tenant_id));
CREATE POLICY "reconciliation runs write" ON public.restaurant_reconciliation_runs FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant','inventory_manager']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant','inventory_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_reconciliation_runs_updated_at BEFORE UPDATE ON public.restaurant_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.restaurant_reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.restaurant_reconciliation_runs(id) ON DELETE SET NULL,
  close_id uuid REFERENCES public.restaurant_daily_closes(id) ON DELETE SET NULL,
  business_date date NOT NULL,
  domain text NOT NULL,
  code text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  what_happened text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  impact_value numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  required_action text NOT NULL,
  entity_type text,
  entity_id uuid,
  dedupe_key text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolution text,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key)
);
CREATE INDEX restaurant_reconciliation_exceptions_open_idx
  ON public.restaurant_reconciliation_exceptions (tenant_id, status, business_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_reconciliation_exceptions TO authenticated;
GRANT ALL ON public.restaurant_reconciliation_exceptions TO service_role;
ALTER TABLE public.restaurant_reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reconciliation exceptions read" ON public.restaurant_reconciliation_exceptions FOR SELECT TO authenticated
  USING (restaurant_can_read(tenant_id));
CREATE POLICY "reconciliation exceptions write" ON public.restaurant_reconciliation_exceptions FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant','inventory_manager','purchasing_officer']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant','inventory_manager','purchasing_officer']::restaurant_role[]));
CREATE TRIGGER restaurant_reconciliation_exceptions_updated_at BEFORE UPDATE ON public.restaurant_reconciliation_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.restaurant_reconciliation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  business_date date,
  action text NOT NULL,
  previous_state text,
  new_state text,
  reason text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX restaurant_reconciliation_audit_idx ON public.restaurant_reconciliation_audit (tenant_id, subject_id, created_at DESC);
GRANT SELECT, INSERT ON public.restaurant_reconciliation_audit TO authenticated;
GRANT ALL ON public.restaurant_reconciliation_audit TO service_role;
ALTER TABLE public.restaurant_reconciliation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reconciliation audit read" ON public.restaurant_reconciliation_audit FOR SELECT TO authenticated
  USING (restaurant_can_read(tenant_id));
CREATE POLICY "reconciliation audit append" ON public.restaurant_reconciliation_audit FOR INSERT TO authenticated
  WITH CHECK (restaurant_can_read(tenant_id));
