ALTER TABLE public.restaurant_orders
  ADD COLUMN IF NOT EXISTS bill_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS bill_requested_by uuid,
  ADD COLUMN IF NOT EXISTS bill_presented_at timestamptz;

ALTER TABLE public.restaurant_receipts
  ADD COLUMN IF NOT EXISTS delivery_channel text,
  ADD COLUMN IF NOT EXISTS delivered_to text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reprint_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reprint_by uuid;

ALTER TABLE public.restaurant_payments
  ADD COLUMN IF NOT EXISTS refund_reason text;

CREATE INDEX IF NOT EXISTS restaurant_receipts_number_idx
  ON public.restaurant_receipts (tenant_id, receipt_number);
CREATE INDEX IF NOT EXISTS restaurant_receipts_issued_idx
  ON public.restaurant_receipts (tenant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_orders_bill_requested_idx
  ON public.restaurant_orders (tenant_id, bill_requested_at DESC);