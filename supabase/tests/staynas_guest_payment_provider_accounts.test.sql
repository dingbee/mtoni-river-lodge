\set ON_ERROR_STOP on
BEGIN;
SELECT plan(1);
INSERT INTO public.staynas_organisations(id,slug,name,status)
VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','guest-provider-ci','Guest Provider CI','active'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','guest-provider-other','Guest Provider Other','active');
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status)
VALUES ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','guest-provider-ci','GPCI','Guest Provider CI','active');

DO $$
DECLARE
  v_rls boolean;
  v_secret_id uuid;
  v_secret text;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='staynas_guest_payment_provider_accounts';
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'Guest provider table must have RLS enabled'; END IF;
  IF has_table_privilege('anon','public.staynas_guest_payment_provider_accounts','SELECT')
     OR has_table_privilege('authenticated','public.staynas_guest_payment_provider_accounts','SELECT')
     OR has_table_privilege('authenticated','public.staynas_guest_payment_provider_accounts','INSERT')
     OR has_table_privilege('authenticated','public.staynas_guest_payment_provider_accounts','UPDATE') THEN
    RAISE EXCEPTION 'Client roles must not access guest provider credential references';
  END IF;
  IF NOT has_table_privilege('service_role','public.staynas_guest_payment_provider_accounts','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_guest_payment_provider_accounts','INSERT')
     OR NOT has_table_privilege('service_role','public.staynas_guest_payment_provider_accounts','UPDATE') THEN
    RAISE EXCEPTION 'Service role must retain guest provider configuration access';
  END IF;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  v_secret_id := public.staynas_create_provider_secret('{"merchantKey":"test-key","merchantSecret":"test-secret"}','staynas-ci-guest-provider','CI credential boundary test');
  v_secret := public.staynas_read_provider_secret(v_secret_id);
  IF v_secret NOT LIKE '%merchantSecret%' THEN RAISE EXCEPTION 'Vault credential round-trip failed'; END IF;

  INSERT INTO public.staynas_guest_payment_provider_accounts(
    organisation_id,property_id,provider,provider_account_ref,credential_secret_ref,
    environment,supported_currencies,integration_status,status
  ) VALUES (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
    'mpesa','ci-merchant',v_secret_id,'sandbox',ARRAY['TZS'],'adapter_pending','inactive'
  );

  BEGIN
    UPDATE public.staynas_guest_payment_provider_accounts SET status='active'
    WHERE provider_account_ref='ci-merchant';
    RAISE EXCEPTION 'Guest provider with pending adapter must not activate';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.staynas_guest_payment_provider_accounts(
      organisation_id,property_id,provider,provider_account_ref,credential_secret_ref,
      environment,supported_currencies
    ) VALUES (
      'ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111',
      'mpesa','cross-tenant-merchant',v_secret_id,'sandbox',ARRAY['TZS']
    );
    RAISE EXCEPTION 'Cross-tenant property mapping must be rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  UPDATE public.staynas_guest_payment_provider_accounts
     SET integration_status='ready'
   WHERE provider_account_ref='ci-merchant';
  INSERT INTO public.staynas_guest_payment_provider_accounts(
    organisation_id,property_id,provider,provider_account_ref,credential_secret_ref,
    environment,supported_currencies,integration_status,status
  ) VALUES (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
    'pesapal','ci-pesapal',v_secret_id,'sandbox',ARRAY['TZS'],'ready','inactive'
  );
  PERFORM public.staynas_set_guest_checkout_provider(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    (SELECT id FROM public.staynas_guest_payment_provider_accounts WHERE provider_account_ref='ci-merchant')
  );
  IF (SELECT count(*) FROM public.staynas_guest_payment_provider_accounts
       WHERE property_id='11111111-1111-4111-8111-111111111111' AND status='active') <> 1
     OR (SELECT provider FROM public.staynas_guest_payment_provider_accounts
          WHERE property_id='11111111-1111-4111-8111-111111111111' AND status='active') <> 'mpesa' THEN
    RAISE EXCEPTION 'Selecting a checkout provider must activate exactly the selected provider';
  END IF;
  PERFORM public.staynas_set_guest_checkout_provider(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    NULL
  );
  IF EXISTS (SELECT 1 FROM public.staynas_guest_payment_provider_accounts
              WHERE property_id='11111111-1111-4111-8111-111111111111' AND status='active') THEN
    RAISE EXCEPTION 'Disabling online checkout must deactivate all guest providers';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  BEGIN
    PERFORM public.staynas_read_provider_secret(v_secret_id);
    RAISE EXCEPTION 'Authenticated role must not read provider secrets';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT pass('staynas_guest_payment_provider_accounts contract assertions passed');

ROLLBACK;