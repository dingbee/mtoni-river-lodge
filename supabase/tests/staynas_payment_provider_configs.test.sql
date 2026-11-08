\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='staynas_payment_provider_configs';
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'Provider configuration must have RLS enabled'; END IF;
  IF has_table_privilege('anon','public.staynas_payment_provider_configs','SELECT')
     OR has_table_privilege('authenticated','public.staynas_payment_provider_configs','SELECT')
     OR has_table_privilege('authenticated','public.staynas_payment_provider_configs','INSERT')
     OR has_table_privilege('authenticated','public.staynas_payment_provider_configs','UPDATE') THEN
    RAISE EXCEPTION 'Client roles must not access provider credentials or configuration rows';
  END IF;
  IF NOT has_table_privilege('service_role','public.staynas_payment_provider_configs','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_payment_provider_configs','INSERT')
     OR NOT has_table_privilege('service_role','public.staynas_payment_provider_configs','UPDATE') THEN
    RAISE EXCEPTION 'Server service role must retain provider configuration access';
  END IF;
END;
$$;

INSERT INTO public.staynas_organisations(id,slug,name,status)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','provider-config-ci','Provider Config CI','active');

INSERT INTO public.staynas_payment_provider_configs(
  configuration_scope,provider,provider_account_ref,environment,supported_currencies,
  public_configuration,encrypted_credentials,status
) VALUES (
  'platform_subscription','pesapal','platform-ci','sandbox',ARRAY['TZS','USD'],
  '{"label":"StayNas subscription collections"}','v1.ciphertext','inactive'
);

INSERT INTO public.staynas_payment_provider_configs(
  configuration_scope,organisation_id,property_id,provider,provider_account_ref,
  environment,supported_currencies,public_configuration,encrypted_credentials,status
) VALUES (
  'property_guest','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','mpesa','property-ci',
  'sandbox',ARRAY['TZS'],'{"label":"Guest mobile money"}','v1.ciphertext','inactive'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.staynas_payment_provider_configs(
      configuration_scope,provider,provider_account_ref,environment,supported_currencies
    ) VALUES ('property_guest','mpesa','invalid-scope','sandbox',ARRAY['TZS']);
    RAISE EXCEPTION 'Invalid provider scope owner combination must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.staynas_payment_provider_configs(
      configuration_scope,provider,provider_account_ref,environment,supported_currencies,
      encrypted_credentials,status
    ) VALUES ('platform_subscription','mpesa','missing-secret','sandbox',ARRAY['TZS'],NULL,'active');
    RAISE EXCEPTION 'Active provider without credentials must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF (SELECT count(*) FROM public.staynas_payment_provider_configs) <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two isolated provider configuration scopes';
  END IF;
END;
$$;

ROLLBACK;
