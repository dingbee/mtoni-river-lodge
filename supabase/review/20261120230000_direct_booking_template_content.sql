-- Direct booking template content for property-scoped StayNas branding.
-- REVIEW ARTIFACT: apply only after the application changes in this branch pass CI
-- and the release is approved. Additive only: no existing column, row, policy or
-- grant is changed. Existing RLS policies and table-level grants on
-- public.staynas_property_branding cover the new columns.
--
-- value_words  jsonb array of up to 3 short strings shown under the hero.
-- highlights   jsonb array of up to 4 objects {title, description, icon}.
-- offer        jsonb object {enabled, eyebrow, title, body, ctaLabel, ctaUrl, imageUrl}
--              or NULL when the property has no offer banner.
-- The application validates field lengths and URL formats; the constraints
-- below guard the stored shape so malformed rows cannot reach guest pages.
BEGIN;

ALTER TABLE public.staynas_property_branding
  ADD COLUMN IF NOT EXISTS value_words jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS offer jsonb;

ALTER TABLE public.staynas_property_branding
  DROP CONSTRAINT IF EXISTS staynas_property_branding_value_words_shape,
  ADD CONSTRAINT staynas_property_branding_value_words_shape
    CHECK (jsonb_typeof(value_words) = 'array' AND jsonb_array_length(value_words) <= 3),
  DROP CONSTRAINT IF EXISTS staynas_property_branding_highlights_shape,
  ADD CONSTRAINT staynas_property_branding_highlights_shape
    CHECK (jsonb_typeof(highlights) = 'array' AND jsonb_array_length(highlights) <= 4),
  DROP CONSTRAINT IF EXISTS staynas_property_branding_offer_shape,
  ADD CONSTRAINT staynas_property_branding_offer_shape
    CHECK (offer IS NULL OR jsonb_typeof(offer) = 'object');

COMMENT ON COLUMN public.staynas_property_branding.value_words IS
  'Direct booking template: up to 3 short value words shown in the hero.';
COMMENT ON COLUMN public.staynas_property_branding.highlights IS
  'Direct booking template: up to 4 highlight cards {title, description, icon}.';
COMMENT ON COLUMN public.staynas_property_branding.offer IS
  'Direct booking template: optional offer banner {enabled, eyebrow, title, body, ctaLabel, ctaUrl, imageUrl}.';

COMMIT;

-- Rollback (only if no property has saved template content that must be kept):
-- BEGIN;
-- ALTER TABLE public.staynas_property_branding
--   DROP CONSTRAINT IF EXISTS staynas_property_branding_value_words_shape,
--   DROP CONSTRAINT IF EXISTS staynas_property_branding_highlights_shape,
--   DROP CONSTRAINT IF EXISTS staynas_property_branding_offer_shape,
--   DROP COLUMN IF EXISTS value_words,
--   DROP COLUMN IF EXISTS highlights,
--   DROP COLUMN IF EXISTS offer;
-- COMMIT;
