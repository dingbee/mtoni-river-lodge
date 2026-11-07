BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(16);

SELECT has_table('public','staynas_distribution_connections','distribution connections table exists');
SELECT has_table('public','staynas_distribution_mappings','distribution mappings table exists');
SELECT has_table('public','staynas_distribution_operations','operation ledger exists');
SELECT has_table('public','staynas_distribution_outbox','transactional outbox exists');
SELECT has_table('public','staynas_distribution_reservation_inbox','reservation inbox exists');

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

SELECT ok(NOT has_table_privilege('anon','public.staynas_distribution_connections','SELECT'),
  'anonymous role cannot read connection secrets or metadata');
SELECT ok(NOT has_table_privilege('authenticated','public.staynas_distribution_reservation_inbox','SELECT'),
  'authenticated browser role cannot read raw reservation inbox payloads');

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

SELECT * FROM finish();
ROLLBACK;
