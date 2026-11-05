-- Canonical guest-facing room definition fields for the platform catalogue.
-- Additive only: no property room, assignment, inventory, pricing, booking or membership rows are modified.
ALTER TABLE public.staynas_room_catalogue_types
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS room_number_label text,
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text;

COMMENT ON COLUMN public.staynas_room_catalogue_types.description IS 'Guest-facing room description paragraphs.';
COMMENT ON COLUMN public.staynas_room_catalogue_types.details IS 'Guest-facing room detail rows, stored as label/value objects.';
COMMENT ON COLUMN public.staynas_room_catalogue_types.cta_line IS 'Guest-facing room call-to-action line.';