-- ---------- Price lists ----------
CREATE TABLE IF NOT EXISTS public.restaurant_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'TZS',
  channel text,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'draft',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_rest_price_lists_tenant ON public.restaurant_price_lists (tenant_id, status, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_price_lists TO authenticated;
GRANT ALL ON public.restaurant_price_lists TO service_role;
ALTER TABLE public.restaurant_price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price lists read" ON public.restaurant_price_lists FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "price lists write" ON public.restaurant_price_lists FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]));

CREATE TRIGGER trg_rest_price_lists_updated_at
  BEFORE UPDATE ON public.restaurant_price_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Rounding policies ----------
CREATE TABLE IF NOT EXISTS public.restaurant_rounding_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  target text NOT NULL DEFAULT 'total',
  mode text NOT NULL DEFAULT 'nearest',
  increment numeric(14,4) NOT NULL DEFAULT 0.01,
  decimals smallint NOT NULL DEFAULT 2,
  currency text,
  channel text,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CONSTRAINT restaurant_rounding_target_chk CHECK (target IN ('line','total','payment')),
  CONSTRAINT restaurant_rounding_mode_chk CHECK (mode IN ('none','nearest','up','down'))
);
CREATE INDEX IF NOT EXISTS idx_rest_rounding_tenant ON public.restaurant_rounding_rules (tenant_id, target, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_rounding_rules TO authenticated;
GRANT ALL ON public.restaurant_rounding_rules TO service_role;
ALTER TABLE public.restaurant_rounding_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rounding rules read" ON public.restaurant_rounding_rules FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "rounding rules write" ON public.restaurant_rounding_rules FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager']::restaurant_role[]));

CREATE TRIGGER trg_rest_rounding_updated_at
  BEFORE UPDATE ON public.restaurant_rounding_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Channel + price-list scope on existing commercial rules ----------
ALTER TABLE public.restaurant_prices
  ADD COLUMN IF NOT EXISTS price_list_id uuid REFERENCES public.restaurant_price_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text;

ALTER TABLE public.restaurant_promotions
  ADD COLUMN IF NOT EXISTS applies_to_channels text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.restaurant_tax_rules
  ADD COLUMN IF NOT EXISTS applies_to_channels text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.restaurant_service_charges
  ADD COLUMN IF NOT EXISTS applies_to_channels text[] NOT NULL DEFAULT '{}';

-- ---------- Historical explainability on sold lines ----------
ALTER TABLE public.restaurant_order_items
  ADD COLUMN IF NOT EXISTS price_list_id uuid REFERENCES public.restaurant_price_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text;
