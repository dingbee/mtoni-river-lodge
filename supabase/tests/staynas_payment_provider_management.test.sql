BEGIN;

DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='staynas_platform_payment_provider_accounts';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Platform provider configuration table must have RLS enabled';
  END IF;
  IF has_table_privilege('anon','public.staynas_platform_payment_provider_accounts','SELECT')
     OR has_table_privilege('authenticated','public.staynas_platform_payment_provider_accounts','SELECT') THEN
    RAISE EXCEPTION 'Platform provider configuration must not be readable through client roles';
  END IF;
  IF NOT has_table_privilege('service_role','public.staynas_platform_payment_provider_accounts','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_platform_payment_provider_accounts','INSERT')
     OR NOT has_table_privilege('service_role','public.staynas_platform_payment_provider_accounts','UPDATE') THEN
    RAISE EXCEPTION 'Server service role must retain platform provider configuration access';
  END IF;
END;
$$;

INSERT INTO public.staynas_platform_payment_provider_accounts (
  provider, provider_account_ref, credential_secret_ref, environment,
  supported_currencies, integration_status, status
) VALUES (
  'mpesa', 'CI-MPESA-PLATFORM', gen_random_uuid(), 'sandbox',
  ARRAY['TZS'], 'adapter_pending', 'inactive'
);

DO $$
BEGIN
  BEGIN
    UPDATE public.staynas_platform_payment_provider_accounts
      SET status='active'
      WHERE provider_account_ref='CI-MPESA-PLATFORM';
    RAISE EXCEPTION 'Provider with pending adapter must not activate';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_platform_payment_provider_accounts
    WHERE provider='mpesa' AND provider_account_ref='CI-MPESA-PLATFORM'
      AND status='inactive' AND integration_status='adapter_pending'
  ) THEN
    RAISE EXCEPTION 'Platform mobile-money provider configuration was not persisted safely';
  END IF;
END;
$$;

ROLLBACK;
