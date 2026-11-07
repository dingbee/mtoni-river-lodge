BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(40);

SELECT has_table('public','staynas_distribution_connections','distribution connections table exists');
SELECT has_table('public','staynas_distribution_mappings','distribution mappings table exists');
SELECT has_table('public','staynas_distribution_operations','operation ledger exists');
SELECT has_table('public','staynas_distribution_outbox','transactional outbox exists');
SELECT has_table('public','staynas_distribution_reservation_inbox','reservation inbox exists');
SELECT has_table('public','staynas_distribution_price_commitments','immutable provider price commitment ledger exists');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_connections'::regclass),
  'connections enforce row-level security');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_mappings'::regclass),
  'mappings enforce row-level security');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_operations'::regclass),
  'operations enforce row-level security');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_outbox'::regclass),
  'outbox enforces row-level security');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_reservation_inbox'::regclass),
  'reservation inbox enforces row-level security');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_price_commitments'::regclass),
  'price commitment ledger enforces row-level security');

SELECT ok(NOT has_table_privilege('anon','public.staynas_distribution_connections','SELECT'),
  'anonymous role cannot read connection secrets or metadata');
SELECT ok(NOT has_table_privilege('authenticated','public.staynas_distribution_reservation_inbox','SELECT'),
  'authenticated browser role cannot read raw reservation inbox payloads');
SELECT ok(NOT has_table_privilege('authenticated','public.staynas_distribution_price_commitments','SELECT'),
  'authenticated browser role cannot read provider financial evidence');
SELECT ok(has_function_privilege('service_role',
  'public.staynas_distribution_record_price_commitment(uuid)','EXECUTE'),
  'trusted service role can record price commitments');

INSERT INTO public.staynas_organisations(slug,name)
VALUES ('spe07-test-tenant-a','SPE07 Test Tenant A'),('spe07-test-tenant-b','SPE07 Test Tenant B')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.staynas_properties(organisation_id,slug,code,name)
SELECT id,'spe07-test-property-a','SPE07A','SPE07 Test Property A'
FROM public.staynas_organisations WHERE slug='spe07-test-tenant-a'
ON CONFLICT (organisation_id,slug) DO NOTHING;

SELECT throws_ok(
  $$
    INSERT INTO public.staynas_distribution_connections(
      organisation_id,property_id,provider,external_account_id,external_property_id,credential_secret_ref
    )
    SELECT tenant_b.id,property_a.id,'test-provider','test-account','test-property','vault://test-reference'
    FROM public.staynas_organisations tenant_b
    CROSS JOIN public.staynas_properties property_a
    WHERE tenant_b.slug='spe07-test-tenant-b' AND property_a.slug='spe07-test-property-a'
  $$,
  '23503', NULL,
  'composite foreign key rejects a property assigned to another tenant'
);

SELECT ok(NOT has_function_privilege('anon',
  'public.staynas_distribution_claim_outbox(integer,integer)','EXECUTE'),
  'anonymous role cannot claim outbox work');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.staynas_distribution_claim_reservation_inbox(integer,integer)','EXECUTE'),
  'authenticated role cannot claim reservation inbox work');
SELECT ok(has_function_privilege('service_role',
  'public.staynas_distribution_claim_outbox(integer,integer)','EXECUTE'),
  'trusted service role can claim outbox work');


CREATE TEMP TABLE spe07_test_connection AS
WITH inserted AS (
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    status,credential_secret_ref,capabilities
  )
  SELECT tenant.id,property.id,'spe07-test-provider','spe07-test-account',
    'spe07-test-external-property','active','vault://spe07-test-reference','{"rates":true}'::jsonb
  FROM public.staynas_organisations tenant
  CROSS JOIN public.staynas_properties property
  WHERE tenant.slug='spe07-test-tenant-a' AND property.slug='spe07-test-property-a'
  RETURNING id,organisation_id,property_id
)
SELECT * FROM inserted;

SELECT is((
  SELECT duplicate FROM public.staynas_distribution_enqueue_operation(
    (SELECT organisation_id FROM spe07_test_connection),
    (SELECT property_id FROM spe07_test_connection),
    (SELECT id FROM spe07_test_connection),
    'rates.push','spe07-idempotency-key-0001',repeat('a',64),
    '{"publication_version":7}'::jsonb,NULL,NULL
  )
),false,'first enqueue creates a new durable operation');

SELECT is((
  SELECT duplicate FROM public.staynas_distribution_enqueue_operation(
    (SELECT organisation_id FROM spe07_test_connection),
    (SELECT property_id FROM spe07_test_connection),
    (SELECT id FROM spe07_test_connection),
    'rates.push','spe07-idempotency-key-0001',repeat('a',64),
    '{"publication_version":7}'::jsonb,NULL,NULL
  )
),true,'repeated enqueue returns the existing operation');

SELECT is((
  SELECT count(*)::integer FROM public.staynas_distribution_outbox
  WHERE connection_id=(SELECT id FROM spe07_test_connection)
),1,'idempotent enqueue creates exactly one outbox event');

SELECT throws_ok(
  $
    SELECT * FROM public.staynas_distribution_enqueue_operation(
      (SELECT organisation_id FROM spe07_test_connection),
      (SELECT property_id FROM spe07_test_connection),
      (SELECT id FROM spe07_test_connection),
      'rates.push','spe07-idempotency-key-0001',repeat('b',64),
      '{"publication_version":8}'::jsonb,NULL,NULL
    )
  $,
  '23505', NULL,
  'idempotency key reuse with a different request fingerprint is rejected'
);

CREATE TEMP TABLE spe07_test_claim AS
SELECT * FROM public.staynas_distribution_claim_outbox(1,120);

SELECT is((SELECT count(*)::integer FROM spe07_test_claim),1,
  'outbox worker claims the queued event with a lease');

SELECT is((
  SELECT status FROM public.staynas_distribution_operations
  WHERE id=(SELECT operation_id FROM spe07_test_claim)
),'processing','claiming outbox work advances the operation ledger to processing');

SELECT is(public.staynas_distribution_finish_outbox(
  (SELECT outbox_id FROM spe07_test_claim),gen_random_uuid(),'delivered',NULL,NULL
),false,'stale worker lease token cannot acknowledge an event');

SELECT is(public.staynas_distribution_finish_outbox(
  (SELECT outbox_id FROM spe07_test_claim),(SELECT lease_token FROM spe07_test_claim),
  'delivered',NULL,NULL
),true,'current lease holder can acknowledge the event');

SELECT is((
  SELECT status FROM public.staynas_distribution_operations
  WHERE id=(SELECT operation_id FROM spe07_test_claim)
),'succeeded','successful outbox delivery advances the operation ledger');


SELECT is((
  SELECT duplicate FROM public.staynas_distribution_receive_reservation_event(
    (SELECT organisation_id FROM spe07_test_connection),
    (SELECT property_id FROM spe07_test_connection),
    (SELECT id FROM spe07_test_connection),
    'spe07-provider-event-1','spe07-external-reservation-1','created','1',
    repeat('c',64),'{"externalReservationId":"spe07-external-reservation-1","confirmedAmountMinor":12345,"currency":"USD","taxAmountMinor":1234,"feeAmountMinor":250,"commissionAmountMinor":500,"paymentStatus":"unpaid"}'::jsonb
  )
),false,'first provider reservation event is durably received');

SELECT is((
  SELECT duplicate FROM public.staynas_distribution_receive_reservation_event(
    (SELECT organisation_id FROM spe07_test_connection),
    (SELECT property_id FROM spe07_test_connection),
    (SELECT id FROM spe07_test_connection),
    'spe07-provider-event-1','spe07-external-reservation-1','created','1',
    repeat('c',64),'{"externalReservationId":"spe07-external-reservation-1","confirmedAmountMinor":12345,"currency":"USD","taxAmountMinor":1234,"feeAmountMinor":250,"commissionAmountMinor":500,"paymentStatus":"unpaid"}'::jsonb
  )
),true,'repeated provider event is identified as a duplicate');

SELECT is((
  SELECT count(*)::integer FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=(SELECT id FROM spe07_test_connection)
),1,'duplicate webhook delivery creates only one inbox record');

CREATE TEMP TABLE spe07_test_price_commitment AS
SELECT public.staynas_distribution_record_price_commitment(id) AS commitment_id
FROM public.staynas_distribution_reservation_inbox
WHERE provider_event_id='spe07-provider-event-1';

SELECT ok((SELECT commitment_id IS NOT NULL FROM spe07_test_price_commitment),
  'provider-confirmed financial terms are captured in the evidence ledger');
SELECT is((
  SELECT confirmed_amount_minor FROM public.staynas_distribution_price_commitments
  WHERE id=(SELECT commitment_id FROM spe07_test_price_commitment)
),12345::bigint,'provider-confirmed amount is preserved without local repricing');
SELECT is((
  SELECT currency FROM public.staynas_distribution_price_commitments
  WHERE id=(SELECT commitment_id FROM spe07_test_price_commitment)
),'USD','provider currency is preserved exactly');
SELECT throws_ok(
  $
    UPDATE public.staynas_distribution_price_commitments
    SET confirmed_amount_minor=99999
    WHERE id=(SELECT commitment_id FROM spe07_test_price_commitment)
  $,
  '55000', 'Provider price commitment evidence is append-only',
  'provider financial evidence cannot be silently modified'
);

SELECT throws_ok(
  $
    SELECT * FROM public.staynas_distribution_receive_reservation_event(
      (SELECT organisation_id FROM spe07_test_connection),
      (SELECT property_id FROM spe07_test_connection),
      (SELECT id FROM spe07_test_connection),
      'spe07-provider-event-1','spe07-external-reservation-1','created','1',
      repeat('d',64),'{"external_reservation_id":"spe07-external-reservation-1","amount_minor":99999,"currency":"USD"}'::jsonb
    )
  $,
  '23505', NULL,
  'provider event ID replay with changed payload is rejected'
);

CREATE TEMP TABLE spe07_test_inbox_claim AS
SELECT * FROM public.staynas_distribution_claim_reservation_inbox(1,120);

SELECT is((SELECT count(*)::integer FROM spe07_test_inbox_claim),1,
  'reservation inbox worker claims the event with a lease');

SELECT is(public.staynas_distribution_finish_reservation_inbox(
  (SELECT inbox_id FROM spe07_test_inbox_claim),gen_random_uuid(),'manual_review',
  NULL,'TEST_REVIEW', 'Awaiting canonical reservation writer',NULL
),false,'stale inbox lease token cannot finalize the event');

SELECT is(public.staynas_distribution_finish_reservation_inbox(
  (SELECT inbox_id FROM spe07_test_inbox_claim),(SELECT lease_token FROM spe07_test_inbox_claim),
  'manual_review',NULL,'TEST_REVIEW','Awaiting canonical reservation writer',NULL
),true,'current inbox lease holder can record a manual-review outcome');

SELECT * FROM finish();
ROLLBACK;
