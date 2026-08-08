ALTER TABLE public.restaurant_inventory_items
  ADD COLUMN IF NOT EXISTS is_beverage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serving_size numeric(14,4),
  ADD COLUMN IF NOT EXISTS serving_unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS restaurant_inventory_items_beverage_idx
  ON public.restaurant_inventory_items (tenant_id, is_beverage);

ALTER TABLE public.restaurant_order_items
  ADD COLUMN IF NOT EXISTS is_comp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comp_reason text,
  ADD COLUMN IF NOT EXISTS comp_by uuid,
  ADD COLUMN IF NOT EXISTS comp_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS restaurant_order_items_comp_idx
  ON public.restaurant_order_items (tenant_id, is_comp) WHERE is_comp;