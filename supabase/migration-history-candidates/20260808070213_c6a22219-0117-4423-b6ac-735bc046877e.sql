-- ============ Order items: seat, variant, modifiers, void audit ============
ALTER TABLE public.restaurant_order_items
  ADD COLUMN IF NOT EXISTS seat_number smallint,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.restaurant_product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS modifier_total numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_notes text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS restaurant_order_items_variant_idx
  ON public.restaurant_order_items (variant_id) WHERE variant_id IS NOT NULL;

-- ============ Orders: terminal, idempotency, reopen audit ============
ALTER TABLE public.restaurant_orders
  ADD COLUMN IF NOT EXISTS terminal_id text,
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid,
  ADD COLUMN IF NOT EXISTS reopen_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_orders_client_request_idx
  ON public.restaurant_orders (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ============ Payments: idempotency + refund linkage ============
ALTER TABLE public.restaurant_payments
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS refund_of uuid REFERENCES public.restaurant_payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_payments_client_request_idx
  ON public.restaurant_payments (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ============ Receipts: immutable evidence of a closed bill ============
CREATE TABLE IF NOT EXISTS public.restaurant_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid,
  location_id uuid,
  order_id uuid NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  currency text NOT NULL DEFAULT 'TZS',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  service_charge numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_total numeric(14,2) NOT NULL DEFAULT 0,
  cost_total numeric(14,4) NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reprint_count integer NOT NULL DEFAULT 0,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_receipts_order_idx
  ON public.restaurant_receipts (order_id);

GRANT SELECT, INSERT, UPDATE ON public.restaurant_receipts TO authenticated;
GRANT ALL ON public.restaurant_receipts TO service_role;

ALTER TABLE public.restaurant_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_receipts_read"
  ON public.restaurant_receipts FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));

CREATE POLICY "restaurant_receipts_write"
  ON public.restaurant_receipts FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]));

CREATE TRIGGER restaurant_receipts_set_updated_at
  BEFORE UPDATE ON public.restaurant_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();