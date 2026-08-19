CREATE TABLE public.restaurant_catalog_item_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  ingredient_key text NOT NULL,
  ingredient_name text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  suggested_domain text,
  suggested_category text,
  suggested_subcategory text,
  suggested_stock_unit_code text,
  suggested_purchase_unit_code text,
  suggested_name text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  created_sku text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_catalog_item_requests_status_check
    CHECK (status IN ('pending','approved','rejected','created')),
  CONSTRAINT restaurant_catalog_item_requests_unique UNIQUE (tenant_id, ingredient_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_catalog_item_requests TO authenticated;
GRANT ALL ON public.restaurant_catalog_item_requests TO service_role;
ALTER TABLE public.restaurant_catalog_item_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_item_requests_read" ON public.restaurant_catalog_item_requests
  FOR SELECT TO authenticated USING (restaurant_can_read(tenant_id));
CREATE POLICY "catalog_item_requests_write" ON public.restaurant_catalog_item_requests
  FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

CREATE TRIGGER restaurant_catalog_item_requests_set_updated_at
  BEFORE UPDATE ON public.restaurant_catalog_item_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.restaurant_catalog_enrichment_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  decision text NOT NULL,
  request_id uuid REFERENCES public.restaurant_catalog_item_requests(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  sku text,
  ingredient_key text,
  ingredient_name text,
  previous_value jsonb,
  new_value jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_catalog_enrichment_decisions_kind_check
    CHECK (decision IN ('item_requested','item_approved','item_rejected','item_created','stock_unit_set','stock_unit_unresolved'))
);

GRANT SELECT, INSERT ON public.restaurant_catalog_enrichment_decisions TO authenticated;
GRANT ALL ON public.restaurant_catalog_enrichment_decisions TO service_role;
ALTER TABLE public.restaurant_catalog_enrichment_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_enrichment_decisions_read" ON public.restaurant_catalog_enrichment_decisions
  FOR SELECT TO authenticated USING (restaurant_can_read(tenant_id));
CREATE POLICY "catalog_enrichment_decisions_write" ON public.restaurant_catalog_enrichment_decisions
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

CREATE INDEX restaurant_catalog_enrichment_decisions_tenant_idx
  ON public.restaurant_catalog_enrichment_decisions (tenant_id, created_at DESC);