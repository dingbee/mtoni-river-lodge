BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

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

SELECT * FROM finish();
ROLLBACK;
