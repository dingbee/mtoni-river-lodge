-- DC-07C â€” make the Channex sandbox catalogue reproducible from an empty database.
-- The original DC-07A activation migration only UPDATEd an existing row. On a
-- clean migration chain that row did not exist, leaving the provider catalogue empty.
-- This forward-only correction is idempotent and keeps the adapter health-only.

BEGIN;

INSERT INTO public.staynas_distribution_provider_catalogue (
  provider_key,
  display_name,
  description,
  adapter_key,
  adapter_version,
  lifecycle,
  capabilities,
  environment_config
)
VALUES (
  'channex',
  'Channex',
  'Channel manager integration; sandbox health validation only.',
  'channex',
  '1.0.0',
  'active',
  ARRAY['connection.health']::text[],
  jsonb_build_object(
    'sandbox',
    jsonb_build_object(
      'apiBaseUrl', 'https://staging.channex.io/api/v1',
      'allowedHosts', jsonb_build_array('staging.channex.io')
    )
  )
)
ON CONFLICT (provider_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    adapter_key = EXCLUDED.adapter_key,
    adapter_version = EXCLUDED.adapter_version,
    lifecycle = EXCLUDED.lifecycle,
    capabilities = EXCLUDED.capabilities,
    environment_config = EXCLUDED.environment_config,
    updated_at = now()
WHERE public.staynas_distribution_provider_catalogue.adapter_version = '1.0.0';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.staynas_distribution_provider_catalogue
    WHERE provider_key = 'channex'
      AND adapter_key = 'channex'
      AND adapter_version = '1.0.0'
      AND lifecycle = 'active'
      AND capabilities = ARRAY['connection.health']::text[]
      AND environment_config #>> '{sandbox,apiBaseUrl}' = 'https://staging.channex.io/api/v1'
      AND environment_config #> '{sandbox,allowedHosts}' = '["staging.channex.io"]'::jsonb
  ) THEN
    RAISE EXCEPTION 'DC-07C Channex sandbox provider catalogue seed is incomplete';
  END IF;
END
$verify$;

COMMIT;
