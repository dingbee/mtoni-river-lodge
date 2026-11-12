-- DC-07A — activate Channex sandbox-only provider configuration.
-- Live endpoint is deliberately absent. The adapter consumes this catalogue row at runtime.

BEGIN;

UPDATE public.staynas_distribution_provider_catalogue
SET lifecycle='active',
    environment_config=jsonb_build_object(
      'sandbox',
      jsonb_build_object(
        'apiBaseUrl','https://staging.channex.io/api/v1',
        'allowedHosts',jsonb_build_array('staging.channex.io')
      )
    ),
    updated_at=now()
WHERE provider_key='channex'
  AND adapter_version='1.0.0'
  AND capabilities @> ARRAY['connection.health']::text[];

INSERT INTO public.staynas_distribution_provider_catalogue_audit
  (provider_key,event_type,actor_type,change_summary,correlation_id)
SELECT 'channex','provider.environment_config_changed','system',
       'Configured the Channex staging endpoint and exact host allowlist; live environment remains absent.',
       'dc07a-channex-sandbox-config'
WHERE NOT EXISTS (
  SELECT 1 FROM public.staynas_distribution_provider_catalogue_audit
  WHERE provider_key='channex' AND correlation_id='dc07a-channex-sandbox-config'
);

INSERT INTO public.staynas_distribution_provider_catalogue_audit
  (provider_key,event_type,actor_type,change_summary,correlation_id)
SELECT 'channex','provider.lifecycle_changed','system',
       'Activated Channex for sandbox-only connection health validation.',
       'dc07a-channex-sandbox-activation'
WHERE NOT EXISTS (
  SELECT 1 FROM public.staynas_distribution_provider_catalogue_audit
  WHERE provider_key='channex' AND correlation_id='dc07a-channex-sandbox-activation'
);

COMMIT;
