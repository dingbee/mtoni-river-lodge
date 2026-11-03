-- Restore the complete historical guest-facing room definition at platform level.
ALTER TABLE public.staynas_room_catalogue_types
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text;

-- Recover the previous property configuration content into the shared platform catalogue.
UPDATE public.staynas_room_catalogue_types ct
SET description = COALESCE(r.description, '{}'),
    details = COALESCE(r.details, '[]'::jsonb),
    cta_line = r.cta_line
FROM public.rooms r
WHERE r.catalogue_type_id = ct.id
  AND (ct.description = '{}' OR ct.details = '[]'::jsonb OR ct.cta_line IS NULL);
