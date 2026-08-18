ALTER TABLE public.restaurant_recipes
  ADD COLUMN IF NOT EXISTS service_period text,
  ADD COLUMN IF NOT EXISTS source_section text,
  ADD COLUMN IF NOT EXISTS portion_basis text,
  ADD COLUMN IF NOT EXISTS source_recipe_code text,
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS source_sheet text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS import_status text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_recipes_source_code_version_uidx
  ON public.restaurant_recipes (tenant_id, source_recipe_code, version)
  WHERE source_recipe_code IS NOT NULL;

ALTER TABLE public.restaurant_recipe_lines
  ADD COLUMN IF NOT EXISTS ingredient_name text,
  ADD COLUMN IF NOT EXISTS quantity_min numeric,
  ADD COLUMN IF NOT EXISTS quantity_max numeric,
  ADD COLUMN IF NOT EXISTS source_unit text,
  ADD COLUMN IF NOT EXISTS candidate_sku text,
  ADD COLUMN IF NOT EXISTS mapping_status text NOT NULL DEFAULT 'resolved',
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS source_sheet text,
  ADD COLUMN IF NOT EXISTS source_row integer,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.restaurant_recipe_lines DROP CONSTRAINT IF EXISTS restaurant_recipe_lines_check;
ALTER TABLE public.restaurant_recipe_lines
  ADD CONSTRAINT restaurant_recipe_lines_component_check CHECK (
    (component_kind = 'inventory_item'::restaurant_recipe_component_kind AND sub_recipe_id IS NULL)
    OR
    (component_kind = 'sub_recipe'::restaurant_recipe_component_kind AND sub_recipe_id IS NOT NULL AND inventory_item_id IS NULL)
  );
ALTER TABLE public.restaurant_recipe_lines
  ADD CONSTRAINT restaurant_recipe_lines_mapping_status_check CHECK (
    mapping_status IN ('resolved','unresolved','review_required')
  );
ALTER TABLE public.restaurant_recipe_lines
  ADD CONSTRAINT restaurant_recipe_lines_resolved_check CHECK (
    mapping_status <> 'resolved'
    OR component_kind = 'sub_recipe'::restaurant_recipe_component_kind
    OR inventory_item_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS restaurant_recipe_lines_mapping_status_idx
  ON public.restaurant_recipe_lines (tenant_id, mapping_status);

-- A recipe with unresolved ingredient mappings must never drive live consumption.
CREATE OR REPLACE FUNCTION public.restaurant_recipe_activation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unresolved integer;
BEGIN
  IF NEW.status = 'active'::restaurant_recipe_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active'::restaurant_recipe_status) THEN
    SELECT count(*) INTO unresolved
    FROM public.restaurant_recipe_lines l
    WHERE l.recipe_id = NEW.id AND l.mapping_status <> 'resolved';
    IF unresolved > 0 THEN
      RAISE EXCEPTION 'Recipe % cannot be activated: % ingredient line(s) are not mapped to a stock item.', NEW.code, unresolved;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_recipe_activation_guard ON public.restaurant_recipes;
CREATE TRIGGER restaurant_recipe_activation_guard
  BEFORE INSERT OR UPDATE OF status ON public.restaurant_recipes
  FOR EACH ROW EXECUTE FUNCTION public.restaurant_recipe_activation_guard();

CREATE OR REPLACE FUNCTION public.restaurant_recipe_line_activation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipe_status restaurant_recipe_status;
BEGIN
  IF NEW.mapping_status <> 'resolved' THEN
    SELECT r.status INTO recipe_status FROM public.restaurant_recipes r WHERE r.id = NEW.recipe_id;
    IF recipe_status = 'active'::restaurant_recipe_status THEN
      RAISE EXCEPTION 'An unmapped ingredient line cannot be added to an active recipe.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_recipe_line_activation_guard ON public.restaurant_recipe_lines;
CREATE TRIGGER restaurant_recipe_line_activation_guard
  BEFORE INSERT OR UPDATE ON public.restaurant_recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.restaurant_recipe_line_activation_guard();

CREATE TABLE IF NOT EXISTS public.restaurant_recipe_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id uuid,
  source_file text NOT NULL,
  source_label text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total_recipes integer NOT NULL DEFAULT 0,
  total_lines integer NOT NULL DEFAULT 0,
  recipes_created integer NOT NULL DEFAULT 0,
  recipes_unchanged integer NOT NULL DEFAULT 0,
  recipes_conflicted integer NOT NULL DEFAULT 0,
  lines_created integer NOT NULL DEFAULT 0,
  lines_unchanged integer NOT NULL DEFAULT 0,
  lines_conflicted integer NOT NULL DEFAULT 0,
  lines_matched integer NOT NULL DEFAULT 0,
  lines_unresolved integer NOT NULL DEFAULT 0,
  lines_review_required integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_recipe_import_batches TO authenticated;
GRANT ALL ON public.restaurant_recipe_import_batches TO service_role;
ALTER TABLE public.restaurant_recipe_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe_import_batches_read" ON public.restaurant_recipe_import_batches
  FOR SELECT TO authenticated USING (restaurant_can_read(tenant_id));
CREATE POLICY "recipe_import_batches_write" ON public.restaurant_recipe_import_batches
  FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

CREATE TABLE IF NOT EXISTS public.restaurant_recipe_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.restaurant_recipe_import_batches(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  source_row integer NOT NULL,
  recipe_code text NOT NULL,
  recipe_name text NOT NULL,
  ingredient_name text,
  candidate_sku text,
  mapping_result text,
  result text NOT NULL,
  message text,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipe_id uuid,
  recipe_line_id uuid,
  inventory_item_id uuid,
  review_status text NOT NULL DEFAULT 'none',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_recipe_import_rows_batch_idx
  ON public.restaurant_recipe_import_rows (tenant_id, batch_id, source_row);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_recipe_import_rows TO authenticated;
GRANT ALL ON public.restaurant_recipe_import_rows TO service_role;
ALTER TABLE public.restaurant_recipe_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe_import_rows_read" ON public.restaurant_recipe_import_rows
  FOR SELECT TO authenticated USING (restaurant_can_read(tenant_id));
CREATE POLICY "recipe_import_rows_write" ON public.restaurant_recipe_import_rows
  FOR ALL TO authenticated
  USING (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

CREATE TRIGGER set_updated_at_recipe_import_batches BEFORE UPDATE ON public.restaurant_recipe_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_recipe_import_rows BEFORE UPDATE ON public.restaurant_recipe_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();