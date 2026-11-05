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
  IF has_table_privilege('anon','public.staynas_distribution_connections','SELECT')
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


SET ROLE service_role;
DO $ledger$
DECLARE
  v_operation_id uuid;
  v_duplicate_id uuid;
  v_created boolean;
  v_claim public.staynas_distribution_operation_ledger%ROWTYPE;
  v_inbox_id uuid;
  v_duplicate_inbox_id uuid;
  v_inbox_created boolean;
BEGIN
  SELECT operation_id,created INTO v_operation_id,v_created
  FROM public.staynas_enqueue_distribution_operation(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'test_provider','sandbox','availability.pull','availability.read',
    'idem-dc04-test-0001',repeat('a',64),'dc04-operation-correlation-001',
    '{"room_type_id":"room-type-1","from":"2027-01-01","to":"2027-01-02"}'::jsonb
  );
  IF NOT v_created THEN RAISE EXCEPTION 'First enqueue was not created'; END IF;

  SELECT operation_id,created INTO v_duplicate_id,v_created
  FROM public.staynas_enqueue_distribution_operation(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'test_provider','sandbox','availability.pull','availability.read',
    'idem-dc04-test-0001',repeat('a',64),'dc04-operation-correlation-duplicate',
    '{"room_type_id":"room-type-1","from":"2027-01-01","to":"2027-01-02"}'::jsonb
  );
  IF v_created OR v_duplicate_id <> v_operation_id THEN
    RAISE EXCEPTION 'Operation idempotency did not return the original operation';
  END IF;

  BEGIN
    PERFORM * FROM public.staynas_enqueue_distribution_operation(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      'test_provider','sandbox','availability.pull','availability.read',
      'idem-dc04-test-0001',repeat('b',64),'dc04-operation-correlation-conflict',
      '{"room_type_id":"room-type-2"}'::jsonb
    );
    RAISE EXCEPTION 'Changed request reused an idempotency key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  SELECT * INTO v_claim
  FROM public.staynas_claim_distribution_operation('dc04-ci-worker',45)
  LIMIT 1;
  IF v_claim.id IS DISTINCT FROM v_operation_id OR v_claim.status <> 'running'
     OR v_claim.lease_token IS NULL OR v_claim.attempt_count <> 1 THEN
    RAISE EXCEPTION 'Atomic operation claim failed';
  END IF;

  PERFORM public.staynas_finish_distribution_operation(
    v_operation_id,v_claim.lease_token,'dc04-ci-worker','succeeded',
    NULL,NULL,'provider-ref-ci','result-ref-ci',200,12,NULL
  );

  IF (SELECT status FROM public.staynas_distribution_operation_ledger WHERE id=v_operation_id) <> 'succeeded'
     OR (SELECT count(*) FROM public.staynas_distribution_operation_attempts
         WHERE operation_id=v_operation_id AND attempt_number=1 AND status='succeeded') <> 1 THEN
    RAISE EXCEPTION 'Operation completion or attempt evidence failed';
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_key,event_type,
    event_payload,correlation_id
  ) VALUES (
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    v_operation_id,'dc04-outbox-event-001','availability.snapshot_requested',
    '{"operation_id":"ci"}'::jsonb,'dc04-operation-correlation-001'
  );

  SELECT inbox_id,created INTO v_inbox_id,v_inbox_created
  FROM public.staynas_receive_distribution_webhook(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'test_provider','sandbox','provider-event-001','availability.updated',
    repeat('c',64),'{"availability_version":"v1"}'::jsonb,
    'dc04-webhook-correlation-001'
  );
  IF NOT v_inbox_created THEN RAISE EXCEPTION 'First webhook event was not inserted'; END IF;

  SELECT inbox_id,created INTO v_duplicate_inbox_id,v_inbox_created
  FROM public.staynas_receive_distribution_webhook(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'test_provider','sandbox','provider-event-001','availability.updated',
    repeat('c',64),'{"availability_version":"v1"}'::jsonb,
    'dc04-webhook-correlation-002'
  );
  IF v_inbox_created OR v_duplicate_inbox_id <> v_inbox_id THEN
    RAISE EXCEPTION 'Webhook event deduplication failed';
  END IF;
END
$ledger$;
RESET ROLE;


SET ROLE service_role;
DO $outbox$
DECLARE
  v_outbox_id uuid;
  v_duplicate_outbox_id uuid;
  v_created boolean;
  v_event public.staynas_distribution_outbox%ROWTYPE;
BEGIN
  SELECT outbox_id,created INTO v_outbox_id,v_created
  FROM public.staynas_enqueue_distribution_outbox(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    NULL,'dc04-outbox-idempotency-001','availability.snapshot_requested',
    '{"snapshot":"v1"}'::jsonb,'dc04-outbox-correlation-001'
  );
  IF NOT v_created THEN RAISE EXCEPTION 'First outbox event was not created'; END IF;

  SELECT outbox_id,created INTO v_duplicate_outbox_id,v_created
  FROM public.staynas_enqueue_distribution_outbox(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    NULL,'dc04-outbox-idempotency-001','availability.snapshot_requested',
    '{"snapshot":"v1"}'::jsonb,'dc04-outbox-correlation-duplicate'
  );
  IF v_created OR v_duplicate_outbox_id <> v_outbox_id THEN
    RAISE EXCEPTION 'Outbox idempotency failed';
  END IF;

  BEGIN
    PERFORM * FROM public.staynas_enqueue_distribution_outbox(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      NULL,'dc04-outbox-idempotency-001','availability.snapshot_requested',
      '{"snapshot":"v2"}'::jsonb,'dc04-outbox-correlation-conflict'
    );
    RAISE EXCEPTION 'Outbox key accepted a changed event';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  SELECT * INTO v_event
  FROM public.staynas_claim_distribution_outbox('dc04-outbox-worker',45)
  LIMIT 1;
  -- The earlier ledger smoke fixture inserted one pending event directly.
  -- Complete it first if it is the next ordered claim, then claim our RPC event.
  IF v_event.id IS DISTINCT FROM v_outbox_id THEN
    IF v_event.status <> 'publishing' OR v_event.lease_token IS NULL THEN
      RAISE EXCEPTION 'Unexpected pre-existing outbox claim state';
    END IF;
    PERFORM public.staynas_finish_distribution_outbox(
      v_event.id,v_event.lease_token,'dc04-outbox-worker','published',NULL,NULL
    );
    SELECT * INTO v_event
    FROM public.staynas_claim_distribution_outbox('dc04-outbox-worker',45)
    LIMIT 1;
  END IF;
  IF v_event.id IS DISTINCT FROM v_outbox_id OR v_event.status <> 'publishing'
     OR v_event.lease_token IS NULL OR v_event.attempt_count <> 1 THEN
    RAISE EXCEPTION 'Atomic outbox claim failed';
  END IF;

  PERFORM public.staynas_finish_distribution_outbox(
    v_outbox_id,v_event.lease_token,'dc04-outbox-worker','published',NULL,NULL
  );
  IF (SELECT status FROM public.staynas_distribution_outbox WHERE id=v_outbox_id) <> 'published'
     OR (SELECT published_at FROM public.staynas_distribution_outbox WHERE id=v_outbox_id) IS NULL THEN
    RAISE EXCEPTION 'Outbox publication completion failed';
  END IF;
END
$outbox$;
RESET ROLE;

SELECT 'DC-04 migration, credential broker and outbox smoke tests passed' AS result;
