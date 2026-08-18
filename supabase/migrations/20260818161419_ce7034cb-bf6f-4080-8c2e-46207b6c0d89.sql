ALTER TABLE public.restaurant_inventory_items
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'FNB',
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS pack_label text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_row integer,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.restaurant_inventory_items
  DROP CONSTRAINT IF EXISTS restaurant_inventory_items_data_status_check;
ALTER TABLE public.restaurant_inventory_items
  ADD CONSTRAINT restaurant_inventory_items_data_status_check
  CHECK (data_status IN ('CONFIRMED','UNCONFIRMED'));

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_inventory_items_tenant_sku_key
  ON public.restaurant_inventory_items (tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS restaurant_inventory_items_domain_idx
  ON public.restaurant_inventory_items (tenant_id, domain);

CREATE TABLE IF NOT EXISTS public.restaurant_catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  source_file text NOT NULL,
  source_label text NOT NULL DEFAULT 'Mtoni legacy master list',
  status text NOT NULL DEFAULT 'completed',
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  unconfirmed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_catalog_import_batches TO authenticated;
GRANT ALL ON public.restaurant_catalog_import_batches TO service_role;
ALTER TABLE public.restaurant_catalog_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_import_batches_read" ON public.restaurant_catalog_import_batches
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "catalog_import_batches_write" ON public.restaurant_catalog_import_batches
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager']::restaurant_role[]));

CREATE TABLE IF NOT EXISTS public.restaurant_catalog_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.restaurant_catalog_import_batches(id) ON DELETE CASCADE,
  source_row integer NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  result text NOT NULL,
  message text,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  review_status text NOT NULL DEFAULT 'none',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_catalog_import_rows_result_check
    CHECK (result IN ('created','unchanged','updated','conflict','skipped','error')),
  CONSTRAINT restaurant_catalog_import_rows_review_check
    CHECK (review_status IN ('none','REVIEW_REQUIRED','resolved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_catalog_import_rows_batch_sku_key
  ON public.restaurant_catalog_import_rows (batch_id, sku);
CREATE INDEX IF NOT EXISTS restaurant_catalog_import_rows_review_idx
  ON public.restaurant_catalog_import_rows (tenant_id, review_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_catalog_import_rows TO authenticated;
GRANT ALL ON public.restaurant_catalog_import_rows TO service_role;
ALTER TABLE public.restaurant_catalog_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_import_rows_read" ON public.restaurant_catalog_import_rows
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "catalog_import_rows_write" ON public.restaurant_catalog_import_rows
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager']::restaurant_role[]));

CREATE TRIGGER set_updated_at_catalog_import_batches
  BEFORE UPDATE ON public.restaurant_catalog_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_catalog_import_rows
  BEFORE UPDATE ON public.restaurant_catalog_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();