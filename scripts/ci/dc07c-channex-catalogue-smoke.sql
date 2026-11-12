DO $$
DECLARE
  v_rls boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_provider_catalogue
    WHERE provider_key='channex'
      AND lifecycle='active'
      AND adapter_key='channex'
      AND adapter_version='1.0.0'
      AND capabilities=ARRAY['connection.health']::text[]
      AND environment_config=jsonb_build_object(
        'sandbox',jsonb_build_object(
          'apiBaseUrl','https://staging.channex.io/api/v1',
          'allowedHosts',jsonb_build_array('staging.channex.io')
        )
      )
  ) THEN
    RAISE EXCEPTION 'DC-07C Channex sandbox catalogue row is missing or over-authorized';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid='public.staynas_distribution_provider_catalogue'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'DC-07C provider catalogue RLS is disabled';
  END IF;
  IF has_table_privilege('anon','public.staynas_distribution_provider_catalogue','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_provider_catalogue','select')
     OR NOT has_table_privilege('service_role','public.staynas_distribution_provider_catalogue','select') THEN
    RAISE EXCEPTION 'DC-07C provider catalogue grants are not platform-service-only';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.staynas_distribution_provider_catalogue
    WHERE provider_key='channex' AND environment_config ? 'live'
  ) THEN
    RAISE EXCEPTION 'DC-07C live Channex environment must remain absent';
  END IF;
¶»§q«^