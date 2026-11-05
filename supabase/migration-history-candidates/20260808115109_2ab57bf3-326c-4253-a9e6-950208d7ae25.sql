CREATE TABLE public.restaurant_receipt_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id uuid,
  location_id uuid,
  receipt_id uuid NOT NULL REFERENCES public.restaurant_receipts(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  receipt_number text,
  method text NOT NULL CHECK (method IN ('print','email','whatsapp','secure_link')),
  recipient text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','shared')),
  provider text,
  provider_reference text,
  failure_code text,
  failure_reason text,
  attempt integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  share_token text,
  share_expires_at timestamptz,
  correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  initiated_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX restaurant_receipt_deliveries_idem_key
  ON public.restaurant_receipt_deliveries (tenant_id, idempotency_key);
CREATE UNIQUE INDEX restaurant_receipt_deliveries_share_token
  ON public.restaurant_receipt_deliveries (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX restaurant_receipt_deliveries_receipt_idx
  ON public.restaurant_receipt_deliveries (tenant_id, receipt_id, requested_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.restaurant_receipt_deliveries TO authenticated;
GRANT ALL ON public.restaurant_receipt_deliveries TO service_role;

ALTER TABLE public.restaurant_receipt_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipt deliveries readable by tenant"
  ON public.restaurant_receipt_deliveries FOR SELECT TO authenticated
  USING (public.restaurant_can_read(tenant_id));

CREATE POLICY "receipt deliveries writable by tenant staff"
  ON public.restaurant_receipt_deliveries FOR INSERT TO authenticated
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]));

CREATE POLICY "receipt deliveries updatable by tenant staff"
  ON public.restaurant_receipt_deliveries FOR UPDATE TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','bartender','accountant']::restaurant_role[]));