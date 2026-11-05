-- Run after DC-04.6 and DC-04.7 migrations in disposable PostgreSQL.
\set ON_ERROR_STOP on

INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000001');

INSERT INTO public.staynas_organisations(id,slug) VALUES
  ('20000000-0000-4000-8000-000000000001','tenant-a');
INSERT INTO public.staynas_properties(id,organisation_id,slug) VALUES
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','property-a'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','property-b');
INSERT INTO vault.secrets(id,decrypted_secret) VALUES
  ('40000000-0000-4000-8000-000000000001','dc04-ci-dummy-secret');

INSERT INTO public.staynas_distribution_external_accounts(
  id,organisation_id,provider_key,external_account_reference,environment,
  credential_reference,lifecycle
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'test_provider','account-a','sandbox',
  '40000000-0000-4000-8000-000000000001','connected'
);

INSERT INTO public.staynas_distribution_account_grants(
  id,organisation_id,property_id,external_account_id,provider_key,environment,
  grant_status,granted_capabilities,granted_by
) VALUES (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'test_provider','sandbox','active',ARRAY['availability.read'],
  '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.staynas_distribution_connections(
  id,organisation_id,property_id,account_grant_id,external_account_id,
  provider_key,adapter_version,environment,lifecycle
) VALUES (
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'test_provider','1.0.0','sandbox','connected'
);

DO $test$
BEGIN
  IF NOT has_table_privilege('anon','public.staynas_distribution_connections','SELECT')
     OR has_table_privilege('authenticated','public.staynas_distribution_connections','SELECT') THEN
    RAISE EXCEPTION 'Unexpected browser-role table grants';
  END IF;

  IF has_table_privilege('anon','vault.decrypted_secrets','SELECT')
     OR has_table_privilege('authenticated','vault.decrypted_secrets','SELECT')
     OR NOT has_table_privilege('service_role','vault.decrypted_secrets','SELECT') THEN
    RAISE EXCEPTION 'Vault view grants are not restricted as expected';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.staynas_resolve_distribution_credential(uuid,uuid,uuid,text,text,text,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.staynas_resolve_distribution_credential(uuid,uuid,uuid,text,text,text,text,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.staynas_resolve_distribution_credential(uuid,uuid,uuid,text,text,text,text,text)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Credential broker execute grants are incorrect';
  END IF;
END
$test$;

SET ROLE service_role;
DO $test$
DECLARE resolved text;
BEGIN
  resolved := public.staynas_resolve_distribution_credential(
    '70000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'test_provider','account-a','sandbox','availability.read','dc04-ci-correlation-001'
  );
  IF resolved <> 'dc04-ci-dummy-secret' THEN
    RAISE EXCEPTION 'Authorized credential resolution failed';
  END IF;

  BEGIN
    PERFORM public.staynas_resolve_distribution_credential(
      '70000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'test_provider','account-a','sandbox','availability.read','dc04-ci-correlation-002'
    );
    RAISE EXCEPTION 'Cross-property credential resolution unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.staynas_resolve_distribution_credential(
      '70000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'test_provider','account-a','sandbox','reservation.import','dc04-ci-correlation-003'
    );
    RAISE EXCEPTION 'Undeclared capability unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;
END
$test$;
RESET ROLE;

DO $test$
BEGIN
  IF (SELECT count(*) FROM public.staynas_distribution_audit_events
      WHERE event_type='credential.accessed'
        AND correlation_id='dc04-ci-correlation-001') <> 1 THEN
    RAISE EXCEPTION 'Credential access audit evidence missing or duplicated';
  END IF;
END
$test$;

SELECT 'DC-04 migration and credential broker smoke tests passed' AS result;
