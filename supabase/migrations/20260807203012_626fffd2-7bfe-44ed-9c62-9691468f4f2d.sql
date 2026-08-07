/* Sprint 5.3 — Product, Recipe & Production Architecture */

DO $$ BEGIN
  CREATE TYPE public.restaurant_recipe_status AS ENUM ('draft','active','inactive','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_recipe_kind AS ENUM ('menu','sub_recipe','production');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_recipe_component_kind AS ENUM ('inventory_item','sub_recipe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_production_status AS ENUM ('draft','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_product_type AS ENUM ('standard','retail','variant_parent','bundle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_modifier_effect AS ENUM ('none','inventory','recipe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* ---------- 1. Recipes ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  kind public.restaurant_recipe_kind NOT NULL DEFAULT 'menu',
  status public.restaurant_recipe_status NOT NULL DEFAULT 'draft',
  category_id uuid REFERENCES public.restaurant_categories(id) ON DELETE SET NULL,
  lineage_id uuid,
  supersedes_id uuid REFERENCES public.restaurant_recipes(id) ON DELETE SET NULL,
  yield_quantity numeric NOT NULL DEFAULT 1,
  yield_unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  produces_inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  instructions text,
  notes text,
  target_cost numeric,
  computed_cost numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  effective_from date,
  effective_to date,
  last_reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version)
);
CREATE INDEX IF NOT EXISTS restaurant_recipes_tenant_idx ON public.restaurant_recipes (tenant_id, status);
CREATE INDEX IF NOT EXISTS restaurant_recipes_lineage_idx ON public.restaurant_recipes (lineage_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_recipes TO authenticated;
GRANT ALL ON public.restaurant_recipes TO service_role;
ALTER TABLE public.restaurant_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes read" ON public.restaurant_recipes
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "recipes write" ON public.restaurant_recipes
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_recipes_updated_at BEFORE UPDATE ON public.restaurant_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_recipe_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.restaurant_recipes(id) ON DELETE CASCADE,
  component_kind public.restaurant_recipe_component_kind NOT NULL DEFAULT 'inventory_item',
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE RESTRICT,
  sub_recipe_id uuid REFERENCES public.restaurant_recipes(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  yield_percent numeric NOT NULL DEFAULT 100,
  is_optional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (component_kind = 'inventory_item' AND inventory_item_id IS NOT NULL AND sub_recipe_id IS NULL)
    OR (component_kind = 'sub_recipe' AND sub_recipe_id IS NOT NULL AND inventory_item_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS restaurant_recipe_lines_recipe_idx ON public.restaurant_recipe_lines (recipe_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_recipe_lines TO authenticated;
GRANT ALL ON public.restaurant_recipe_lines TO service_role;
ALTER TABLE public.restaurant_recipe_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe lines read" ON public.restaurant_recipe_lines
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "recipe lines write" ON public.restaurant_recipe_lines
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_recipe_lines_updated_at BEFORE UPDATE ON public.restaurant_recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_recipe_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.restaurant_recipes(id) ON DELETE CASCADE,
  recipe_version integer NOT NULL DEFAULT 1,
  ingredient_cost numeric NOT NULL DEFAULT 0,
  sub_recipe_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  cost_per_yield_unit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_by uuid,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_recipe_cost_history_idx
  ON public.restaurant_recipe_cost_history (tenant_id, recipe_id, computed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_recipe_cost_history TO authenticated;
GRANT ALL ON public.restaurant_recipe_cost_history TO service_role;
ALTER TABLE public.restaurant_recipe_cost_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe cost history read" ON public.restaurant_recipe_cost_history
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "recipe cost history write" ON public.restaurant_recipe_cost_history
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','accountant']::restaurant_role[]));

/* ---------- 2. Products ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  product_type public.restaurant_product_type NOT NULL DEFAULT 'standard',
  category_id uuid REFERENCES public.restaurant_categories(id) ON DELETE SET NULL,
  recipe_id uuid REFERENCES public.restaurant_recipes(id) ON DELETE SET NULL,
  menu_item_id uuid REFERENCES public.restaurant_menu_items(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  station_id uuid REFERENCES public.restaurant_stations(id) ON DELETE SET NULL,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_code text,
  prep_time_target_minutes integer,
  service_period_ids uuid[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);
CREATE INDEX IF NOT EXISTS restaurant_products_tenant_idx ON public.restaurant_products (tenant_id, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_products TO authenticated;
GRANT ALL ON public.restaurant_products TO service_role;
ALTER TABLE public.restaurant_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.restaurant_products
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "products write" ON public.restaurant_products
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_products_updated_at BEFORE UPDATE ON public.restaurant_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.restaurant_products(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  price_is_delta boolean NOT NULL DEFAULT false,
  recipe_id uuid REFERENCES public.restaurant_recipes(id) ON DELETE SET NULL,
  yield_factor numeric NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_product_variants TO authenticated;
GRANT ALL ON public.restaurant_product_variants TO service_role;
ALTER TABLE public.restaurant_product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product variants read" ON public.restaurant_product_variants
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "product variants write" ON public.restaurant_product_variants
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_product_variants_updated_at BEFORE UPDATE ON public.restaurant_product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 3. Modifiers ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_modifier_groups TO authenticated;
GRANT ALL ON public.restaurant_modifier_groups TO service_role;
ALTER TABLE public.restaurant_modifier_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modifier groups read" ON public.restaurant_modifier_groups
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "modifier groups write" ON public.restaurant_modifier_groups
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_modifier_groups_updated_at BEFORE UPDATE ON public.restaurant_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.restaurant_modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  effect public.restaurant_modifier_effect NOT NULL DEFAULT 'none',
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  recipe_id uuid REFERENCES public.restaurant_recipes(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_modifiers_group_idx ON public.restaurant_modifiers (group_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_modifiers TO authenticated;
GRANT ALL ON public.restaurant_modifiers TO service_role;
ALTER TABLE public.restaurant_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modifiers read" ON public.restaurant_modifiers
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "modifiers write" ON public.restaurant_modifiers
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_modifiers_updated_at BEFORE UPDATE ON public.restaurant_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_product_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.restaurant_products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.restaurant_modifier_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, group_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_product_modifier_groups TO authenticated;
GRANT ALL ON public.restaurant_product_modifier_groups TO service_role;
ALTER TABLE public.restaurant_product_modifier_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product modifier groups read" ON public.restaurant_product_modifier_groups
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "product modifier groups write" ON public.restaurant_product_modifier_groups
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

CREATE TABLE IF NOT EXISTS public.restaurant_bundle_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  bundle_product_id uuid NOT NULL REFERENCES public.restaurant_products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.restaurant_products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  price_allocation numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_product_id, component_product_id),
  CHECK (bundle_product_id <> component_product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_bundle_components TO authenticated;
GRANT ALL ON public.restaurant_bundle_components TO service_role;
ALTER TABLE public.restaurant_bundle_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bundle components read" ON public.restaurant_bundle_components
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "bundle components write" ON public.restaurant_bundle_components
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::restaurant_role[]));

/* ---------- 4. Production ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  production_number text NOT NULL,
  recipe_id uuid NOT NULL REFERENCES public.restaurant_recipes(id) ON DELETE RESTRICT,
  recipe_version integer NOT NULL DEFAULT 1,
  status public.restaurant_production_status NOT NULL DEFAULT 'draft',
  production_location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  output_location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  output_inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  batches numeric NOT NULL DEFAULT 1,
  planned_quantity numeric NOT NULL DEFAULT 0,
  actual_quantity numeric,
  yield_variance_quantity numeric,
  yield_variance_percent numeric,
  input_cost numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  output_movement_id uuid REFERENCES public.restaurant_stock_movements(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  started_by uuid,
  completed_by uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, production_number)
);
CREATE INDEX IF NOT EXISTS restaurant_productions_tenant_idx ON public.restaurant_productions (tenant_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_productions TO authenticated;
GRANT ALL ON public.restaurant_productions TO service_role;
ALTER TABLE public.restaurant_productions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "productions read" ON public.restaurant_productions
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "productions write" ON public.restaurant_productions
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','inventory_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','inventory_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_productions_updated_at BEFORE UPDATE ON public.restaurant_productions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_production_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  production_id uuid NOT NULL REFERENCES public.restaurant_productions(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  planned_quantity numeric NOT NULL DEFAULT 0,
  actual_quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  movement_id uuid REFERENCES public.restaurant_stock_movements(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_production_inputs_idx ON public.restaurant_production_inputs (production_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_production_inputs TO authenticated;
GRANT ALL ON public.restaurant_production_inputs TO service_role;
ALTER TABLE public.restaurant_production_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "production inputs read" ON public.restaurant_production_inputs
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "production inputs write" ON public.restaurant_production_inputs
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','inventory_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','inventory_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_production_inputs_updated_at BEFORE UPDATE ON public.restaurant_production_inputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 5. Links into existing operational tables ---------- */

ALTER TABLE public.restaurant_stock_movements
  ADD COLUMN IF NOT EXISTS production_id uuid REFERENCES public.restaurant_productions(id) ON DELETE SET NULL;

ALTER TABLE public.restaurant_order_items
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.restaurant_recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipe_version integer,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.restaurant_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS theoretical_cost numeric NOT NULL DEFAULT 0;
