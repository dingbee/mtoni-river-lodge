-- Restore the complete historical guest-facing room definition at platform level.
ALTER TABLE public.staynas_room_catalogue_types
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text;

