-- Restore the complete historical guest-facing room definition at platform level.
ALTER TABLE public.staynas_room_catalogue_types
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text;


-- Preserve the remaining optional fields from the historical shared room definition type.
ALTER TABLE public.staynas_room_catalogue_types
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS room_number_label text;
