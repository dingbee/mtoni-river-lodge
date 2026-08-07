-- ============ Sprint 5.4 — Pricing, Tax & Commercial Rules Foundation ============

CREATE TYPE public.restaurant_price_scope AS ENUM ('tenant', 'property', 'location');
CREATE TYPE public.restaurant_price_status AS ENUM ('draft', 'pending_approval', 'active', 'superseded', 'expired', 'rejected');
CREATE TYPE public.restaurant_charge_basis AS ENUM ('percent', 'fixed');
CREATE TYPE public.restaurant_discount_scope AS ENUM ('order', 'product', 'category');
CREATE TYPE public.restaurant_promotion_status AS ENUM ('draft', 'scheduled', 'active', 'ended', 'cancelled');
CREATE TYPE public.restaurant_promotion_action AS ENUM ('percent_discount', 'fixed_discount', 'price_override', 'percent_uplift');

-- ---------- Currencies ----------
CREATE TABLE public.restaurant_currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  symbol text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  decimals smallint NOT NULL DEFAULT 2,
  rounding numeric(10,4) NOT NULL DEFAULT 0.01,
  is_base boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_currencies TO authenticated;
GRANT ALL ON public.restaurant_currencies TO service_role;
ALTER TABLE public.restaurant_currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies read" ON public.restaurant_currencies FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "currencies write" ON public.restaurant_currencies FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));

-- ---------- Exchange rates ----------
CREATE TABLE public.restaurant_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric(18,8) NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  manual_override boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rest_fx_lookup ON public.restaurant_exchange_rates (tenant_id, base_currency, target_currency, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_exchange_rates TO authenticated;
GRANT ALL ON public.restaurant_exchange_rates TO service_role;
ALTER TABLE public.restaurant_exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx read" ON public.restaurant_exchange_rates FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "fx write" ON public.restaurant_exchange_rates FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));

-- ---------- Versioned prices ----------
CREATE TABLE public.restaurant_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.restaurant_products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.restaurant_product_variants(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.restaurant_menu_items(id) ON DELETE CASCADE,
  scope restaurant_price_scope NOT NULL DEFAULT 'tenant',
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD',
  amount numeric(14,4) NOT NULL,
  tax_inclusive boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  status restaurant_price_status NOT NULL DEFAULT 'draft',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  reason text,
  supersedes_id uuid REFERENCES public.restaurant_prices(id) ON DELETE SET NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rest_prices_resolution ON public.restaurant_prices (tenant_id, product_id, status, effective_from DESC);
CREATE INDEX idx_rest_prices_menu_item ON public.restaurant_prices (tenant_id, menu_item_id, status, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_prices TO authenticated;
GRANT ALL ON public.restaurant_prices TO service_role;
ALTER TABLE public.restaurant_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prices read" ON public.restaurant_prices FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "prices write" ON public.restaurant_prices FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));

-- ---------- Tax rules ----------
CREATE TABLE public.restaurant_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  basis restaurant_charge_basis NOT NULL DEFAULT 'percent',
  rate numeric(9,4) NOT NULL DEFAULT 0,
  fixed_amount numeric(14,4) NOT NULL DEFAULT 0,
  inclusive boolean NOT NULL DEFAULT false,
  applies_to_categories uuid[] NOT NULL DEFAULT '{}',
  applies_to_products uuid[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  compound boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tax_rules TO authenticated;
GRANT ALL ON public.restaurant_tax_rules TO service_role;
ALTER TABLE public.restaurant_tax_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax read" ON public.restaurant_tax_rules FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "tax write" ON public.restaurant_tax_rules FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));

-- ---------- Service charges ----------
CREATE TABLE public.restaurant_service_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  basis restaurant_charge_basis NOT NULL DEFAULT 'percent',
  rate numeric(9,4) NOT NULL DEFAULT 0,
  fixed_amount numeric(14,4) NOT NULL DEFAULT 0,
  applies_to_categories uuid[] NOT NULL DEFAULT '{}',
  applies_to_products uuid[] NOT NULL DEFAULT '{}',
  applies_to_order_types text[] NOT NULL DEFAULT '{}',
  taxable boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_service_charges TO authenticated;
GRANT ALL ON public.restaurant_service_charges TO service_role;
ALTER TABLE public.restaurant_service_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service charge read" ON public.restaurant_service_charges FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "service charge write" ON public.restaurant_service_charges FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','accountant']::restaurant_role[]));

-- ---------- Discount rules ----------
CREATE TABLE public.restaurant_discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  scope restaurant_discount_scope NOT NULL DEFAULT 'order',
  basis restaurant_charge_basis NOT NULL DEFAULT 'percent',
  value numeric(14,4) NOT NULL DEFAULT 0,
  max_percent numeric(6,2) NOT NULL DEFAULT 100,
  applies_to_categories uuid[] NOT NULL DEFAULT '{}',
  applies_to_products uuid[] NOT NULL DEFAULT '{}',
  requires_reason boolean NOT NULL DEFAULT true,
  approval_threshold_percent numeric(6,2),
  role_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_discount_rules TO authenticated;
GRANT ALL ON public.restaurant_discount_rules TO service_role;
ALTER TABLE public.restaurant_discount_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discount rule read" ON public.restaurant_discount_rules FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "discount rule write" ON public.restaurant_discount_rules FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]));

-- ---------- Discount applications (append-only audit) ----------
CREATE TABLE public.restaurant_discount_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  discount_rule_id uuid REFERENCES public.restaurant_discount_rules(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.restaurant_order_items(id) ON DELETE CASCADE,
  scope restaurant_discount_scope NOT NULL DEFAULT 'order',
  basis restaurant_charge_basis NOT NULL DEFAULT 'percent',
  value numeric(14,4) NOT NULL DEFAULT 0,
  amount numeric(14,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  reason text,
  actor_id uuid,
  actor_role text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rest_discount_app_order ON public.restaurant_discount_applications (tenant_id, order_id);
GRANT SELECT, INSERT ON public.restaurant_discount_applications TO authenticated;
GRANT ALL ON public.restaurant_discount_applications TO service_role;
ALTER TABLE public.restaurant_discount_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discount app read" ON public.restaurant_discount_applications FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "discount app insert" ON public.restaurant_discount_applications FOR INSERT TO authenticated WITH CHECK (public.restaurant_can_read(tenant_id));

-- ---------- Promotions ----------
CREATE TABLE public.restaurant_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  action restaurant_promotion_action NOT NULL DEFAULT 'percent_discount',
  value numeric(14,4) NOT NULL DEFAULT 0,
  currency text,
  applies_to_categories uuid[] NOT NULL DEFAULT '{}',
  applies_to_products uuid[] NOT NULL DEFAULT '{}',
  days_of_week smallint[] NOT NULL DEFAULT '{}',
  start_time time,
  end_time time,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  priority integer NOT NULL DEFAULT 100,
  stackable boolean NOT NULL DEFAULT false,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  status restaurant_promotion_status NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_promotions TO authenticated;
GRANT ALL ON public.restaurant_promotions TO service_role;
ALTER TABLE public.restaurant_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promotions read" ON public.restaurant_promotions FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "promotions write" ON public.restaurant_promotions FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]));

-- ---------- Pricing audit (append-only) ----------
CREATE TABLE public.restaurant_pricing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  actor_id uuid,
  correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rest_pricing_audit ON public.restaurant_pricing_audit (tenant_id, entity_type, created_at DESC);
GRANT SELECT, INSERT ON public.restaurant_pricing_audit TO authenticated;
GRANT ALL ON public.restaurant_pricing_audit TO service_role;
ALTER TABLE public.restaurant_pricing_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing audit read" ON public.restaurant_pricing_audit FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "pricing audit insert" ON public.restaurant_pricing_audit FOR INSERT TO authenticated WITH CHECK (public.restaurant_can_read(tenant_id));

-- ---------- Transaction snapshots ----------
ALTER TABLE public.restaurant_order_items
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_id uuid REFERENCES public.restaurant_prices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS base_unit_price numeric(14,4),
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.restaurant_promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_rule_id uuid REFERENCES public.restaurant_discount_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_reason text,
  ADD COLUMN IF NOT EXISTS tax_rule_id uuid REFERENCES public.restaurant_tax_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(9,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_charge_amount numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_id uuid REFERENCES public.restaurant_service_charges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_trace jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurant_orders
  ADD COLUMN IF NOT EXISTS base_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8) NOT NULL DEFAULT 1;

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_rest_currencies_updated BEFORE UPDATE ON public.restaurant_currencies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rest_fx_updated BEFORE UPDATE ON public.restaurant_exchange_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rest_prices_updated BEFORE UPDATE ON public.restaurant_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rest_tax_updated BEFORE UPDATE ON public.restaurant_tax_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rest_svc_updated BEFORE UPDATE ON public.restaurant_service_charges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rest_disc_updated BEFORE UPDATE ON public.restaurant_discount_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rest_promo_updated BEFORE UPDATE ON public.restaurant_promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();