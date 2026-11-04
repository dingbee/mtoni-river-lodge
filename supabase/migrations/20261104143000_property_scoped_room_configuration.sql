-- Store guest-facing room content on the existing property-owned rooms table.
-- Existing room, category, inventory, pricing and booking records are preserved.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS room_number_label text,
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text,
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS rooms_property_sort_idx
  ON public.rooms(property_id, status, sort_order, name);
