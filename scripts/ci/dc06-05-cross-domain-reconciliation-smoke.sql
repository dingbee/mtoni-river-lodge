-- DC-06.05 — cross-domain reconciliation and tenant-isolation contract.
-- Disposable PostgreSQL only. Catalog-level assertions complement DC-05.07 runtime UAT.

\\set ON_ERROR_STOP on
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
    'public.staynas_distribution_webhook_attempts'::regclass,
    'public.staynas_distribution_reservation_links'::regclass,
    'public.staynas_distribution_financial_evidence'::regclass
  ] LOOP
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid=v_rel;
    IF NOT coalesce(v_rls,false) THEN
      RAISE EXCEPTION 'RLS is not enabled on service ledger %',v_rel;
    END IF;
    IF has_table_privilege('anon',v_rel,'SELECT')
       OR has_table_privilege('authenticated',v_rel,'SELECT') THEN
      RAISE EXCEPTION 'Anonymous/authenticated direct SELECT is unexpectedly granted on %',v_rel;
    END IF;
  END LOOP;

  -- Immutable attempt and finance-evidence records must not be mutable by
  -- service_role after insertion; this prevents reconciliation rewriting history.
  IF has_table_privilege('service_role','public.staynas_distribution_operation_attempts','UPDATE')
     OR has_table_privilege('service_role','public.staynas_distribution_operation_attempts','DELETE')
     OR has_table_privilege('service_role','public.staynas_distribution_financial_evidence','UPDATE')
     OR has_table_privilege('service_role','public.staynas_distribution_financial_evidence','DELETE') THEN
    RAISE EXCEPTION 'Immutable distribution evidence/attempt ledger has mutation grants';
  END IF;

  -- Canonical reservation identity: provider/account/external ID is unique,
  -- and one canonical booking cannot be linked twice.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='staynas_distribution_reservation_links'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%provider_key%'
      AND indexdef ILIKE '%external_account_id%' AND indexdef ILIKE '%external_reservation_id%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='staynas_distribution_reservation_links'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%booking_id%'
  ) THEN
    RAISE EXCEPTION 'Reservation link idempotency/one-booking uniqueness is missing';
  END IF;

  -- Operational projections must be unique per canonical booking and source
  -- event. These prevent replay from duplicating operational truth.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='staynas_distribution_operational_reservations'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%booking_id%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='staynas_distribution_operational_events'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%source_inbox_id%'
  ) THEN
    RAISE EXCEPTION 'Operational reservation/event idempotency constraints are missing';
  END IF;

  -- Financial evidence remains its own immutable ledger and must never become
  -- a canonical payment event through an FK or table-level write grant.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_distribution_financial_evidence'::regclass
      AND contype='f' AND confrelid='public.staynas_distribution_webhook_inbox'::regclass
  ) THEN
    RAISE EXCEPTION 'Financial evidence source-inbox provenance FK is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_distribution_financial_evidence'::regclass
      AND contype='f' AND confrelid=to_regclass('public.payment_events')
  ) THEN
    RAISE EXCEPTION 'Provider evidence must not be structurally coupled to canonical payment events';
  END IF;

  -- Property-scoped operational projections require RLS and authenticated
  -- SELECT, but no authenticated mutation.
  FOREACH v_rel IN ARRAY ARRAY[
    'public.staynas_distribution_operational_reservations'::regclass,
    'public.staynas_distribution_operational_events'::regclass,
    'public.staynas_distribution_room_allocations'::regclass
  ] LOOP
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid=v_rel;
    IF NOT coalesce(v_rls,false)
       OR NOT has_table_privilege('authenticated',v_rel,'SELECT')
       OR has_table_privilege('authenticated',v_rel,'INSERT')
       OR has_table_privilege('authenticated',v_rel,'UPDATE')
       OR has_table_privilege('authenticated',v_rel,'DELETE') THEN
      RAISE EXCEPTION 'Operational projection grants/RLS are incorrect on %',v_rel;
    END IF;
  END LOOP;

  -- Verify the analytics projection remains explicitly read-only and does not
  -- expose cross-property aggregation to callers.
  IF to_regprocedure('public.staynas_get_distribution_analytics(timestamp with time zone,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'DC-06.04 analytics projection missing from reconciliation baseline';
  END IF;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.staynas_get_distribution_analytics(timestamp with time zone,timestamp with time zone)'
  )) INTO v_def;
  IF v_def NOT ILIKE '%staynas_active_property_id%'
     OR v_def NOT ILIKE '%staynas_user_has_property_access%'
     OR v_def NOT ILIKE '%has_any_role%'
     OR v_def ILIKE '%INSERT INTO%'
     OR v_def ILIKE '%UPDATE %'
     OR v_def ILIKE '%DELETE FROM%' THEN
    RAISE EXCEPTION 'Distribution analytics lost active-property authorization or read-only semantics';
  END IF;
END
$dc0605$;
