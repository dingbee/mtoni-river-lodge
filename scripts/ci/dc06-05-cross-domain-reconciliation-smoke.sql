-- DC-06.05 â€” cross-domain reconciliation and tenant-isolation contract.
-- Disposable PostgreSQL only. Catalog-level assertions complement DC-05.07 runtime UAT.

\set ON_ERROR_STOP on
DO $dc0605$
DECLARE
  v_rel regclass;
  v_rls boolean;
  v_def text;
BEGIN
  -- All domains required by the reconciliation boundary must exist.
  FOREACH v_rel IN ARRAY ARRAY[
    to_regclass('public.staynas_distribution_operation_ledger'),
    to_regclass('public.staynas_distribution_operation_attempts'),
    to_regclass('public.staynas_distribution_outbox'),
    to_regclass('public.staynas_distribution_webhook_inbox'),
    to_regclass('public.staynas_distribution_webhook_attempts'),
    to_regclass('public.staynas_distribution_reservation_links'),
    to_regclass('public.staynas_distribution_operational_reservations'),
    to_regclass('public.staynas_distribution_operational_events'),
    to_regclass('public.staynas_distribution_financial_evidence'),
    to_regclass('public.bookings')
  ] LOOP
    IF v_rel IS NULL THEN
      RAISE EXCEPTION 'DC-06.05 required cross-domain relation is missing';
    END IF;
  END LOOP;

  -- Distribution execution ledgers are service-only, not tenant-readable.
  FOREACH v_rel IN ARRAY ARRAY[
    'public.staynas_distribution_operation_ledger'::regclass,
    'public.staynas_distribution_operation_attempts'::regclass,
    'public.staynas_distribution_outbox'::regclass,
    'public.staynas_distribution_webhook_inbox'::regclass,
    'public.staynas_distribution_we¶»§q«^