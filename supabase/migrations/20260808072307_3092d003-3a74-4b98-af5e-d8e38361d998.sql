DO $$ BEGIN
  CREATE TYPE public.restaurant_requisition_status AS ENUM ('draft','submitted','approved','partially_issued','fulfilled','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.restaurant_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  reference text NOT NULL,
  kind text NOT NULL DEFAULT 'kitchen',
  department text,
  source_location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE RESTRICT,
  destination_location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE RESTRICT,
  status public.restaurant_requisition_status NOT NULL DEFAULT 'draft',
  required_date date,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  requested_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  issued_by uuid,
  issued_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);

CREATE TABLE public.restaurant_requisition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.restaurant_requisitions(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  description text,
  requested_quantity numeric NOT NULL DEFAULT 0,
  approved_quantity numeric,
  issued_quantity numeric NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_restaurant_requisitions_tenant_status ON public.restaurant_requisitions (tenant_id, status, created_at DESC);
CREATE INDEX idx_restaurant_requisition_lines_req ON public.restaurant_requisition_lines (requisition_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_requisitions TO authenticated;
GRANT ALL ON public.restaurant_requisitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_requisition_lines TO authenticated;
GRANT ALL ON public.restaurant_requisition_lines TO service_role;

ALTER TABLE public.restaurant_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_requisition_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requisitions read" ON public.restaurant_requisitions
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "requisitions write" ON public.restaurant_requisitions
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));

CREATE POLICY "requisition lines read" ON public.restaurant_requisition_lines
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "requisition lines write" ON public.restaurant_requisition_lines
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));

CREATE TRIGGER set_restaurant_requisitions_updated_at BEFORE UPDATE ON public.restaurant_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_restaurant_requisition_lines_updated_at BEFORE UPDATE ON public.restaurant_requisition_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();