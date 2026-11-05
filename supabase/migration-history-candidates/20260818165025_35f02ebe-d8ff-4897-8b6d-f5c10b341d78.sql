-- Ingredient mapping library: legacy ingredient text -> master catalog item.
CREATE TABLE public.restaurant_recipe_ingredient_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  ingredient_key TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  inventory_item_id UUID NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  confidence NUMERIC,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_recipe_ingredient_aliases_status_check CHECK (status IN ('confirmed','rejected')),
  CONSTRAINT restaurant_recipe_ingredient_aliases_unique UNIQUE (tenant_id, ingredient_key, inventory_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_recipe_ingredient_aliases TO authenticated;
GRANT ALL ON public.restaurant_recipe_ingredient_aliases TO service_role;

ALTER TABLE public.restaurant_recipe_ingredient_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipe_ingredient_aliases_read
  ON public.restaurant_recipe_ingredient_aliases FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));

CREATE POLICY recipe_ingredient_aliases_write
  ON public.restaurant_recipe_ingredient_aliases FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner'::restaurant_role,'general_manager'::restaurant_role,'restaurant_manager'::restaurant_role,'chef'::restaurant_role,'kitchen_manager'::restaurant_role]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner'::restaurant_role,'general_manager'::restaurant_role,'restaurant_manager'::restaurant_role,'chef'::restaurant_role,'kitchen_manager'::restaurant_role]));

CREATE INDEX restaurant_recipe_ingredient_aliases_key_idx
  ON public.restaurant_recipe_ingredient_aliases (tenant_id, ingredient_key, status);

CREATE TRIGGER restaurant_recipe_ingredient_aliases_set_updated_at
  BEFORE UPDATE ON public.restaurant_recipe_ingredient_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Permanent decision history. Append-only from the app's point of view.
CREATE TABLE public.restaurant_recipe_mapping_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.restaurant_recipes(id) ON DELETE SET NULL,
  recipe_line_id UUID REFERENCES public.restaurant_recipe_lines(id) ON DELETE SET NULL,
  recipe_code TEXT,
  ingredient_key TEXT NOT NULL,
  ingredient_name TEXT,
  decision TEXT NOT NULL,
  inventory_item_id UUID REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  previous_inventory_item_id UUID,
  previous_mapping_status TEXT,
  new_mapping_status TEXT,
  candidate_sku TEXT,
  confidence NUMERIC,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  applied_to_all BOOLEAN NOT NULL DEFAULT false,
  decided_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_recipe_mapping_decisions_decision_check
    CHECK (decision IN ('confirmed','rejected','left_unresolved','review_required'))
);

GRANT SELECT, INSERT ON public.restaurant_recipe_mapping_decisions TO authenticated;
GRANT ALL ON public.restaurant_recipe_mapping_decisions TO service_role;

ALTER TABLE public.restaurant_recipe_mapping_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipe_mapping_decisions_read
  ON public.restaurant_recipe_mapping_decisions FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));

CREATE POLICY recipe_mapping_decisions_insert
  ON public.restaurant_recipe_mapping_decisions FOR INSERT TO authenticated
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner'::restaurant_role,'general_manager'::restaurant_role,'restaurant_manager'::restaurant_role,'chef'::restaurant_role,'kitchen_manager'::restaurant_role]));

CREATE INDEX restaurant_recipe_mapping_decisions_line_idx
  ON public.restaurant_recipe_mapping_decisions (tenant_id, recipe_line_id, created_at DESC);
CREATE INDEX restaurant_recipe_mapping_decisions_key_idx
  ON public.restaurant_recipe_mapping_decisions (tenant_id, ingredient_key, created_at DESC);