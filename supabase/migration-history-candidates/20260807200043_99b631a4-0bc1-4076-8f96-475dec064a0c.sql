-- =========================================================
-- Sprint 5.2 — Inventory Control & Multi-Location
-- The ledger (restaurant_stock_movements) remains the single
-- source of truth for balances. Everything added here either
-- feeds the ledger or is derived from it.
-- =========================================================

/* ---------- 1. Locations become a configurable storage tree ---------- */

ALTER TABLE public.restaurant_locations
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_storage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_locations_tenant_code_key
  ON public.restaurant_locations (tenant_id, lower(code)) WHERE code IS NOT NULL;

/* ---------- 2. Item-level configuration (commercial, not hard-coded) ---------- */

ALTER TABLE public.restaurant_inventory_items
  ADD COLUMN IF NOT EXISTS track_batches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_negative boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS purchase_unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumption_unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pack_size numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer;

/* ---------- 3. Movement types ---------- */

ALTER TYPE public.restaurant_stock_movement_type ADD VALUE IF NOT EXISTS 'adjustment_in';
ALTER TYPE public.restaurant_stock_movement_type ADD VALUE IF NOT EXISTS 'adjustment_out';
ALTER TYPE public.restaurant_stock_movement_type ADD VALUE IF NOT EXISTS 'production';
ALTER TYPE public.restaurant_stock_movement_type ADD VALUE IF NOT EXISTS 'reversal';

/* ---------- 4. New lifecycle enums ---------- */

DO $$ BEGIN
  CREATE TYPE public.restaurant_transfer_status AS ENUM
    ('draft','requested','approved','rejected','dispatched','partially_received','received','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_stocktake_status AS ENUM
    ('draft','counting','review','approved','posted','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_reservation_status AS ENUM
    ('active','released','consumed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restaurant_stocktake_scope AS ENUM
    ('full','location','category','selected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* ---------- 5. Configurable reason catalogue (waste / adjustment) ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_inventory_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('waste','adjustment','transfer','stocktake')),
  code text NOT NULL,
  label text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  requires_note boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_inventory_reasons TO authenticated;
GRANT ALL ON public.restaurant_inventory_reasons TO service_role;
ALTER TABLE public.restaurant_inventory_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory reasons read" ON public.restaurant_inventory_reasons
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "inventory reasons write" ON public.restaurant_inventory_reasons
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager']::restaurant_role[]));
CREATE TRIGGER restaurant_inventory_reasons_updated_at BEFORE UPDATE ON public.restaurant_inventory_reasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 6. Batches / lots ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.restaurant_suppliers(id) ON DELETE SET NULL,
  batch_number text NOT NULL,
  received_date date,
  expiry_date date,
  quantity numeric NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, inventory_item_id, batch_number)
);
CREATE INDEX IF NOT EXISTS restaurant_batches_expiry_idx
  ON public.restaurant_inventory_batches (tenant_id, expiry_date) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_inventory_batches TO authenticated;
GRANT ALL ON public.restaurant_inventory_batches TO service_role;
ALTER TABLE public.restaurant_inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory batches read" ON public.restaurant_inventory_batches
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "inventory batches write" ON public.restaurant_inventory_batches
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','purchasing_officer']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','purchasing_officer']::restaurant_role[]));
CREATE TRIGGER restaurant_inventory_batches_updated_at BEFORE UPDATE ON public.restaurant_inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 7. Transfers ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  transfer_number text NOT NULL,
  source_location_id uuid NOT NULL REFERENCES public.restaurant_locations(id) ON DELETE RESTRICT,
  destination_location_id uuid NOT NULL REFERENCES public.restaurant_locations(id) ON DELETE RESTRICT,
  status public.restaurant_transfer_status NOT NULL DEFAULT 'draft',
  requires_approval boolean NOT NULL DEFAULT false,
  requested_by uuid,
  approved_by uuid,
  dispatched_by uuid,
  received_by uuid,
  requested_at timestamptz,
  approved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  rejection_reason text,
  notes text,
  total_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, transfer_number),
  CHECK (source_location_id <> destination_location_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_stock_transfers TO authenticated;
GRANT ALL ON public.restaurant_stock_transfers TO service_role;
ALTER TABLE public.restaurant_stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock transfers read" ON public.restaurant_stock_transfers
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "stock transfers write" ON public.restaurant_stock_transfers
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));
CREATE TRIGGER restaurant_stock_transfers_updated_at BEFORE UPDATE ON public.restaurant_stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_stock_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.restaurant_stock_transfers(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.restaurant_inventory_batches(id) ON DELETE SET NULL,
  requested_quantity numeric NOT NULL DEFAULT 0,
  dispatched_quantity numeric NOT NULL DEFAULT 0,
  received_quantity numeric NOT NULL DEFAULT 0,
  rejected_quantity numeric NOT NULL DEFAULT 0,
  damaged_quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  variance_quantity numeric GENERATED ALWAYS AS (dispatched_quantity - received_quantity - rejected_quantity - damaged_quantity) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_transfer_lines_transfer_idx
  ON public.restaurant_stock_transfer_lines (transfer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_stock_transfer_lines TO authenticated;
GRANT ALL ON public.restaurant_stock_transfer_lines TO service_role;
ALTER TABLE public.restaurant_stock_transfer_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock transfer lines read" ON public.restaurant_stock_transfer_lines
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "stock transfer lines write" ON public.restaurant_stock_transfer_lines
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));
CREATE TRIGGER restaurant_stock_transfer_lines_updated_at BEFORE UPDATE ON public.restaurant_stock_transfer_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 8. Reservations (committed, not yet consumed) ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  status public.restaurant_reservation_status NOT NULL DEFAULT 'active',
  purpose text NOT NULL DEFAULT 'operational',
  reference_type text,
  reference_id uuid,
  needed_at timestamptz,
  expires_at timestamptz,
  released_at timestamptz,
  notes text,
  dedupe_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS restaurant_reservations_active_idx
  ON public.restaurant_stock_reservations (tenant_id, inventory_item_id, location_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_stock_reservations TO authenticated;
GRANT ALL ON public.restaurant_stock_reservations TO service_role;
ALTER TABLE public.restaurant_stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock reservations read" ON public.restaurant_stock_reservations
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "stock reservations write" ON public.restaurant_stock_reservations
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));
CREATE TRIGGER restaurant_stock_reservations_updated_at BEFORE UPDATE ON public.restaurant_stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 9. Stocktake ---------- */

CREATE TABLE IF NOT EXISTS public.restaurant_stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.restaurant_properties(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.restaurant_inventory_categories(id) ON DELETE SET NULL,
  stocktake_number text NOT NULL,
  scope public.restaurant_stocktake_scope NOT NULL DEFAULT 'location',
  status public.restaurant_stocktake_status NOT NULL DEFAULT 'draft',
  counted_by uuid,
  reviewed_by uuid,
  approved_by uuid,
  started_at timestamptz,
  counted_at timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  variance_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stocktake_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_stocktakes TO authenticated;
GRANT ALL ON public.restaurant_stocktakes TO service_role;
ALTER TABLE public.restaurant_stocktakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stocktakes read" ON public.restaurant_stocktakes
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "stocktakes write" ON public.restaurant_stocktakes
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));
CREATE TRIGGER restaurant_stocktakes_updated_at BEFORE UPDATE ON public.restaurant_stocktakes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.restaurant_stocktake_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.restaurant_tenants(id) ON DELETE CASCADE,
  stocktake_id uuid NOT NULL REFERENCES public.restaurant_stocktakes(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.restaurant_inventory_items(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.restaurant_locations(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.restaurant_inventory_units(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.restaurant_inventory_batches(id) ON DELETE SET NULL,
  expected_quantity numeric NOT NULL DEFAULT 0,
  counted_quantity numeric,
  variance_quantity numeric GENERATED ALWAYS AS (coalesce(counted_quantity, 0) - expected_quantity) STORED,
  unit_cost numeric NOT NULL DEFAULT 0,
  reason_code text,
  notes text,
  counted_at timestamptz,
  posted_movement_id uuid REFERENCES public.restaurant_stock_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stocktake_id, inventory_item_id, location_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_stocktake_lines TO authenticated;
GRANT ALL ON public.restaurant_stocktake_lines TO service_role;
ALTER TABLE public.restaurant_stocktake_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stocktake lines read" ON public.restaurant_stocktake_lines
  FOR SELECT TO authenticated USING (public.restaurant_can_read(tenant_id));
CREATE POLICY "stocktake lines write" ON public.restaurant_stocktake_lines
  FOR ALL TO authenticated
  USING (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]))
  WITH CHECK (public.restaurant_can_write(tenant_id, ARRAY['owner','general_manager','restaurant_manager','inventory_manager','kitchen_manager','chef','bartender']::restaurant_role[]));
CREATE TRIGGER restaurant_stocktake_lines_updated_at BEFORE UPDATE ON public.restaurant_stocktake_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- 10. Ledger enrichment (still the only source of truth) ---------- */

ALTER TABLE public.restaurant_stock_movements
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.restaurant_stock_transfers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_line_id uuid REFERENCES public.restaurant_stock_transfer_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stocktake_id uuid REFERENCES public.restaurant_stocktakes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.restaurant_inventory_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid REFERENCES public.restaurant_stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS restaurant_movements_item_location_idx
  ON public.restaurant_stock_movements (tenant_id, inventory_item_id, location_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_movements_transfer_idx
  ON public.restaurant_stock_movements (transfer_id) WHERE transfer_id IS NOT NULL;

/* ---------- 11. Derived read models (never a second source of truth) ---------- */

CREATE OR REPLACE VIEW public.restaurant_stock_positions_v
WITH (security_invoker = true) AS
SELECT
  m.tenant_id,
  m.inventory_item_id,
  m.location_id,
  sum(m.quantity)                                   AS on_hand,
  sum(m.quantity) FILTER (WHERE m.quantity > 0)     AS total_in,
  sum(-m.quantity) FILTER (WHERE m.quantity < 0)    AS total_out,
  max(m.occurred_at)                                AS last_movement_at,
  count(*)                                          AS movement_count
FROM public.restaurant_stock_movements m
GROUP BY m.tenant_id, m.inventory_item_id, m.location_id;

GRANT SELECT ON public.restaurant_stock_positions_v TO authenticated;
GRANT SELECT ON public.restaurant_stock_positions_v TO service_role;

CREATE OR REPLACE VIEW public.restaurant_stock_reconciliation_v
WITH (security_invoker = true) AS
WITH ledger AS (
  SELECT tenant_id, inventory_item_id, sum(quantity) AS ledger_quantity, count(*) AS movement_count
  FROM public.restaurant_stock_movements
  GROUP BY tenant_id, inventory_item_id
),
orphan AS (
  SELECT tenant_id, inventory_item_id, count(*) AS orphan_transfer_movements
  FROM public.restaurant_stock_movements
  WHERE movement_type IN ('transfer_in','transfer_out') AND transfer_id IS NULL
  GROUP BY tenant_id, inventory_item_id
)
SELECT
  i.tenant_id,
  i.id                                        AS inventory_item_id,
  i.name,
  i.current_quantity                          AS item_quantity,
  coalesce(l.ledger_quantity, 0)              AS ledger_quantity,
  i.current_quantity - coalesce(l.ledger_quantity, 0) AS drift,
  coalesce(l.movement_count, 0)               AS movement_count,
  coalesce(o.orphan_transfer_movements, 0)    AS orphan_transfer_movements,
  (i.current_quantity < 0 AND NOT i.allow_negative) AS illegal_negative
FROM public.restaurant_inventory_items i
LEFT JOIN ledger l ON l.tenant_id = i.tenant_id AND l.inventory_item_id = i.id
LEFT JOIN orphan o ON o.tenant_id = i.tenant_id AND o.inventory_item_id = i.id;

GRANT SELECT ON public.restaurant_stock_reconciliation_v TO authenticated;
GRANT SELECT ON public.restaurant_stock_reconciliation_v TO service_role;

/* ---------- 12. Document numbering for the new documents ---------- */
-- restaurant_next_document_number(_tenant, _doc_type, _prefix) already exists
-- and is reused for 'transfer' (TRF) and 'stocktake' (STK).