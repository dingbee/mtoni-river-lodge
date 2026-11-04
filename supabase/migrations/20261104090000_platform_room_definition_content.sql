-- Platform room definition content. Deliberately separate from property room inventory and commercial fields.
ALTER TABLE public.staynas_room_catalogue_types
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS room_number_label text,
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text;

COMMENT ON COLUMN public.staynas_room_catalogue_types.description IS 'Historical guest-facing room description paragraphs.';
COMMENT ON COLUMN public.staynas_room_catalogue_types.details IS 'Historical guest-facing detail rows as label/value objects.';
COMMENT ON COLUMN public.staynas_room_catalogue_types.cta_line IS 'Historical guest-facing call-to-action line.';
