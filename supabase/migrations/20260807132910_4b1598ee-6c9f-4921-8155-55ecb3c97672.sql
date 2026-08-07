
-- =========================================================
-- Restaurant & Bar OS — Phase 1 commercial foundation
-- =========================================================

CREATE TYPE public.restaurant_role AS ENUM (
  'owner','general_manager','restaurant_manager','chef','kitchen_manager',
  'bartender','inventory_manager','purchasing_officer','accountant','viewer'
);

CREATE TYPE public.restaurant_menu_status AS ENUM ('draft','published','archived');
CREATE TYPE public.restaurant_po_status AS ENUM ('draft','submitted','approved','partially_received','received','cancelled');

-- ---------- Tenancy ----------
CREATE TABLE public.restaurant_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  currency text NOT NULL DEFAULT 'TZS',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE public.restaurant_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'restaurant',
  status text NOT NULL DEFAULT 'active',
  service_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, slug)
);

CREATE TABLE public.restaurant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.restaurant_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, role)
);
CREATE INDEX idx_restaurant_members_user ON public.restaurant_members(user_id);

CREATE TABLE public.restaurant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'active',
  seats integer NOT NULL DEFAULT 5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Access helpers ----------
CREATE OR REPLACE FUNCTION public.restaurant_is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(_user_id, ARRAY['owner','admin','manager']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.restaurant_can_read(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.restaurant_is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.restaurant_members m
                WHERE m.tenant_id = _tenant_id AND m.user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.restaurant_can_write(_tenant_id uuid, _roles public.restaurant_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.restaurant_is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.restaurant_members m
                WHERE m.tenant_id = _tenant_id AND m.user_id = auth.uid()
                  AND m.role = ANY(_roles))
  );
$$;

-- ---------- Menu ----------
CREATE TABLE public.restaurant_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.restaurant_categories(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'menu',
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, slug)
);

CREATE TABLE public.restaurant_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status public.restaurant_menu_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'TZS',
  valid_from date,
  valid_to date,
  description text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug, version)
);

CREATE TABLE public.restaurant_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES public.restaurant_menus(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.restaurant_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  cost_price numeric(12,2),
  available boolean NOT NULL DEFAULT true,
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  allergens text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  image_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_id, slug)
);

-- ---------- Inventory ----------
CREATE TABLE public.restaurant_inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  dimension text NOT NULL DEFAULT 'count',
  base_unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  factor numeric(16,6) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_restaurant_units_code
  ON public.restaurant_inventory_units (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

CREATE TABLE public.restaurant_inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.restaurant_inventory_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  kind text NOT NULL DEFAULT 'ingredient',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE public.restaurant_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.restaurant_inventory_categories(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  item_type text NOT NULL DEFAULT 'ingredient',
  current_quantity numeric(16,4) NOT NULL DEFAULT 0,
  par_level numeric(16,4),
  reorder_point numeric(16,4),
  average_cost numeric(14,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);
CREATE INDEX idx_restaurant_inv_items_tenant ON public.restaurant_inventory_items(tenant_id, property_id);

-- ---------- Suppliers ----------
CREATE TABLE public.restaurant_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  payment_terms text,
  lead_time_days integer,
  reliability_score numeric(5,2),
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE public.restaurant_supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.restaurant_suppliers(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  supplier_sku text,
  name text NOT NULL,
  pack_size numeric(16,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  min_order_quantity numeric(16,4),
  lead_time_days integer,
  last_price_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_restaurant_supplier_products ON public.restaurant_supplier_products(tenant_id, supplier_id);

-- ---------- Purchasing ----------
CREATE TABLE public.restaurant_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.restaurant_suppliers(id) ON DELETE SET NULL,
  reference text NOT NULL,
  status public.restaurant_po_status NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT current_date,
  expected_at date,
  received_at timestamptz,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);

CREATE TABLE public.restaurant_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.restaurant_purchase_orders(id) ON DELETE CASCADE,
  supplier_product_id uuid REFERENCES public.restaurant_supplier_products(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(16,4) NOT NULL DEFAULT 1,
  received_quantity numeric(16,4) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_restaurant_po_items ON public.restaurant_purchase_order_items(purchase_order_id);

-- ---------- Costing ----------
CREATE TABLE public.restaurant_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.restaurant_menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.restaurant_inventory_items(id) ON DELETE SET NULL,
  component_menu_item_id uuid REFERENCES public.restaurant_menu_items(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  quantity numeric(16,4) NOT NULL DEFAULT 0,
  yield_percent numeric(6,2) NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_restaurant_recipe_components ON public.restaurant_recipe_components(menu_item_id);

CREATE TABLE public.restaurant_recipe_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.restaurant_menu_items(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  ingredient_cost numeric(14,4) NOT NULL DEFAULT 0,
  overhead_cost numeric(14,4) NOT NULL DEFAULT 0,
  total_cost numeric(14,4) NOT NULL DEFAULT 0,
  target_margin numeric(6,2),
  suggested_price numeric(14,2),
  food_cost_percent numeric(6,2),
  currency text NOT NULL DEFAULT 'TZS',
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_restaurant_recipe_costs ON public.restaurant_recipe_costs(menu_item_id, computed_at DESC);

-- ---------- Grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.restaurant_tenants, public.restaurant_properties, public.restaurant_locations,
  public.restaurant_members, public.restaurant_subscriptions, public.restaurant_categories,
  public.restaurant_menus, public.restaurant_menu_items, public.restaurant_inventory_units,
  public.restaurant_inventory_categories, public.restaurant_inventory_items,
  public.restaurant_suppliers, public.restaurant_supplier_products,
  public.restaurant_purchase_orders, public.restaurant_purchase_order_items,
  public.restaurant_recipe_components, public.restaurant_recipe_costs
TO authenticated;

GRANT ALL ON
  public.restaurant_tenants, public.restaurant_properties, public.restaurant_locations,
  public.restaurant_members, public.restaurant_subscriptions, public.restaurant_categories,
  public.restaurant_menus, public.restaurant_menu_items, public.restaurant_inventory_units,
  public.restaurant_inventory_categories, public.restaurant_inventory_items,
  public.restaurant_suppliers, public.restaurant_supplier_products,
  public.restaurant_purchase_orders, public.restaurant_purchase_order_items,
  public.restaurant_recipe_components, public.restaurant_recipe_costs
TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.restaurant_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_recipe_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_recipe_costs ENABLE ROW LEVEL SECURITY;

-- tenants
CREATE POLICY "tenant read" ON public.restaurant_tenants FOR SELECT TO authenticated
  USING (public.restaurant_can_read(id));
CREATE POLICY "tenant write" ON public.restaurant_tenants FOR ALL TO authenticated
  USING (public.restaurant_can_write(id, ARRAY['owner','general_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(id, ARRAY['owner','general_manager']::public.restaurant_role[]));

-- members (read own tenant; only owner/GM manage)
CREATE POLICY "members read" ON public.restaurant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.restaurant_can_read(tenant_id));
CREATE POLICY "members write" ON public.restaurant_members FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager']::public.restaurant_role[]));

-- subscriptions (read-only for members; platform admins manage)
CREATE POLICY "subscriptions read" ON public.restaurant_subscriptions FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "subscriptions write" ON public.restaurant_subscriptions FOR ALL TO authenticated
  USING (public.restaurant_is_platform_admin(auth.uid()))
  WITH CHECK (public.restaurant_is_platform_admin(auth.uid()));

-- properties / locations
CREATE POLICY "properties read" ON public.restaurant_properties FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "properties write" ON public.restaurant_properties FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager']::public.restaurant_role[]));

CREATE POLICY "locations read" ON public.restaurant_locations FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "locations write" ON public.restaurant_locations FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::public.restaurant_role[]));

-- menu domain
CREATE POLICY "categories read" ON public.restaurant_categories FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "categories write" ON public.restaurant_categories FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::public.restaurant_role[]));

CREATE POLICY "menus read" ON public.restaurant_menus FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "menus write" ON public.restaurant_menus FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::public.restaurant_role[]));

CREATE POLICY "menu items read" ON public.restaurant_menu_items FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "menu items write" ON public.restaurant_menu_items FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','bartender']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','bartender']::public.restaurant_role[]));

-- inventory domain
CREATE POLICY "units read" ON public.restaurant_inventory_units FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.restaurant_can_read(tenant_id));
CREATE POLICY "units write" ON public.restaurant_inventory_units FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager']::public.restaurant_role[]))
  WITH CHECK (tenant_id IS NOT NULL AND public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager']::public.restaurant_role[]));

CREATE POLICY "inv categories read" ON public.restaurant_inventory_categories FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "inv categories write" ON public.restaurant_inventory_categories FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef']::public.restaurant_role[]));

CREATE POLICY "inv items read" ON public.restaurant_inventory_items FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "inv items write" ON public.restaurant_inventory_items FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::public.restaurant_role[]));

-- suppliers & purchasing
CREATE POLICY "suppliers read" ON public.restaurant_suppliers FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "suppliers write" ON public.restaurant_suppliers FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager']::public.restaurant_role[]));

CREATE POLICY "supplier products read" ON public.restaurant_supplier_products FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "supplier products write" ON public.restaurant_supplier_products FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager']::public.restaurant_role[]));

CREATE POLICY "po read" ON public.restaurant_purchase_orders FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "po write" ON public.restaurant_purchase_orders FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::public.restaurant_role[]));

CREATE POLICY "po items read" ON public.restaurant_purchase_order_items FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "po items write" ON public.restaurant_purchase_order_items FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','purchasing_officer','inventory_manager','accountant']::public.restaurant_role[]));

-- costing
CREATE POLICY "recipe components read" ON public.restaurant_recipe_components FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "recipe components write" ON public.restaurant_recipe_components FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager']::public.restaurant_role[]));

CREATE POLICY "recipe costs read" ON public.restaurant_recipe_costs FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "recipe costs write" ON public.restaurant_recipe_costs FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','accountant']::public.restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','chef','kitchen_manager','accountant']::public.restaurant_role[]));

-- ---------- updated_at triggers ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'restaurant_tenants','restaurant_properties','restaurant_locations','restaurant_members',
    'restaurant_subscriptions','restaurant_categories','restaurant_menus','restaurant_menu_items',
    'restaurant_inventory_units','restaurant_inventory_categories','restaurant_inventory_items',
    'restaurant_suppliers','restaurant_supplier_products','restaurant_purchase_orders',
    'restaurant_purchase_order_items','restaurant_recipe_components','restaurant_recipe_costs']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- ---------- Seed: Mtoni tenant, property, outlets, standard units ----------
INSERT INTO public.restaurant_tenants (id, slug, name, settings) VALUES
  ('11111111-1111-4111-8111-111111111111', 'mtoni', 'Mtoni River Lodge',
   '{"tax":{"vat_percent":18,"inclusive":true},"service_charge_percent":0,"default_currency":"TZS"}'::jsonb);

INSERT INTO public.restaurant_subscriptions (tenant_id, plan, status, seats, features)
VALUES ('11111111-1111-4111-8111-111111111111','founding','active',25,
        '{"menu":true,"inventory":true,"purchasing":true,"costing":true,"intelligence":true,"pos_integration":false}'::jsonb);

INSERT INTO public.restaurant_properties (id, tenant_id, slug, name) VALUES
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','mtoni-river-lodge','Mtoni River Lodge');

INSERT INTO public.restaurant_locations (tenant_id, property_id, slug, name, location_type) VALUES
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','main-restaurant','Main Restaurant','restaurant'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','pool-bar','Pool Bar','bar'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','main-kitchen','Main Kitchen','kitchen');

INSERT INTO public.restaurant_inventory_units (tenant_id, code, name, dimension, factor) VALUES
  (NULL,'g','Gram','mass',1),
  (NULL,'kg','Kilogram','mass',1000),
  (NULL,'ml','Millilitre','volume',1),
  (NULL,'l','Litre','volume',1000),
  (NULL,'ea','Each','count',1),
  (NULL,'pack','Pack','count',1),
  (NULL,'btl','Bottle','count',1),
  (NULL,'case','Case','count',1),
  (NULL,'portion','Portion','count',1);
