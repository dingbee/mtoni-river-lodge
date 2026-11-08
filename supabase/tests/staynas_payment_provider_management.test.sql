BEGIN;

DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='staynas_payment_provider_configs';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Provider configuration table must have RLS enabled';
  END IF;
  IF has_table_privilege('anon','public.staynas_payment_provider_configs','SELECT')
     OR has_table_privilege('authenticated','public.staynas_payment_provider_configs','SELECT') THEN
    RAISE EXCEPTION 'Provider credentials/configuration must not be readable through client roles';
  END IF;
  IF NOT has_table_privilege('service_role','public.staynas_payment_provider_configs','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_payment_provider_configs','INSERT')
     OR NOT has_table_privilege('service_role','public.staynas_payment_provider_configs','UPDATE') THEN
    RAISE EXCEPTION 'Server service role must retain provider configuration access';
  END IF;
END;
$$;

INSERT INTO public.staynas_payment_provider_configs (
  configuration_scope, provider, provider_account_ref, environment,
  supported_currencies, encrypted_credentials, status
) VALUES (
  'platform_subscription', 'mpesa', 'CI-MPESA-PLATFORM', 'sandbox',
  ARRAY['TZS'], 'v1.test.encrypted.payload', 'inactive'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.staynas_payment_provider_configs (
      configuration_scope, organisation_id, property_id, provider,
      provider_account_ref, environment, supported_currencies
    ) VALUES (
      'platform_subscription', NULL, gen_random_uuid(), 'airtel_money',
      'INVALID-SCOPE', 'sandbox', ARRAY['TZS']
    );
    RAISE EXCEPTION 'Invalid scope ownership combination was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_payment_provider_configs
    WHERE configuration_scope='platform_subscription'
      AND provider='mpesa'
      AND provider_account_ref='CI-MPESA-PLATFORM'
      AND status='inactive'
  ) THEN
    RAISE EXCEPTION 'Platform mobile-money provider configuration was not persisted';
  END IF;
END;
$$;

ROLLBACK;
