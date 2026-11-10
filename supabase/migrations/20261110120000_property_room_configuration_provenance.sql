-- Explicit provenance boundary for property-owned room setup.
-- Historical/demo rows remain preserved but are not treated as tenant configuration.
ALTER TABLE public.room_categories
  ADD COLUMN IF NOT EXISTS configuration_source text NOT NULL DEFAULT 'legacy_unverified'
  CHECK (configuration_source IN ('legacy_unverified','tenant_configured','platform_seeded')),
  ADD COLUMN IF NOT EXISTS configured_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS configured_at timestamptz;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS configuration_source text NOT NULL DEFAULT 'legacy_unverified'
  CHECK (configuration_source IN ('legacy_unverified','tenant_configured','platform_seeded')),
  ADD COLUMN IF NOT EXISTS configured_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS configured_at timestamptz;

CREATE INDEX IF NOT EXISTS room_categories_property_source_idx
  ON public.room_categories(property_id, configuration_source, status);
CREATE INDEX IF NOT EXISTS rooms_property_source_idx
  ON public.rooms(property_id, configuration_source, status);

COMMENT ON COLUMN public.room_categories.configuration_source IS
  'Provenance of configuration. Legacy/unverified records must not be represented as tenant-approved setup.';
COMMENT ON COLUMN public.rooms.configuration_source IS
  'Provenance of configuration. Legacy/unverified records must not be represented as tenant-approved setup.';
