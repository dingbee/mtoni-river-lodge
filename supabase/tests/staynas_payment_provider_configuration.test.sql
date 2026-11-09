\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.staynas_organisations(id,slug,name,status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','provider-test','Provider Test','active');
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','provider-test','PT','Provider Test Property','active');

DO $$
DECLARE
  secret_id uuid;
  secret_value text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  secret_id := public.staynas_create_provider_secret(
    '{"consumerKey":"test-key","consumerSecret":"test-secret","environment":"sandbox","ipnId":"test-ipn"}',
    'staynas-test-provider-secret',
    'isolated CI provider secret test'
  );
  IF secret_id IS NULL THEN RAISE EXCEPTION 'Vault secret reference was not returned'; END IF;
  secret_value := public.staynas_read_provider_secret(secret_id);
  IF secret_value NOT LIKE '%consumerSecret%' THEN RAISE EXCEPTION 'Vault secret round-trip failed'; END IF;

  INSERT INTO public.staynas_guest_payment_provider_accounts(
    organisation_id,property_id,provider,provider_account_ref,credential_secret_ref,
    environment,credential_updated_at,supported_currencies
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'mpesa','merchant-test',secret_id,'sandbox',now(),ARRAY['TZS']
  );

  BEGIN
    UPDATE public.staynas_guest_payment_provider_accounts
      SET status='active'
      WHERE provider_account_ref='merchant-test';
    RAISE EXCEPTION 'Unimplemented adapter must not activate';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  BEGIN
    PERFORM public.staynas_read_provider_secret(secret_id);
    RAISE EXCEPTION 'Authenticated role must not read provider secrets';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

ROLLBACK;