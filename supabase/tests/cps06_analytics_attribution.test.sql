-- CPS-06 structural contracts: durable attribution, tenant isolation,
-- server-only ingestion, lifecycle capture and currency-safe campaign reporting.
BEGIN;
SELECT plan(1);

DO $test$
DECLARE
  v_rel oid;
  v_report text;
BEGIN
  SELECT c.oid INTO v_rel
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='staynas_booking_analytics_events';
  IF v_rel IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=v_rel) THEN
    RAISE EXCEPTION 'CPS-06 analytics event table is missing or RLS is disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='staynas_booking_attributions' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'CPS-06 attribution table is missing or RLS is disabled';
  END IF;

  IF has_table_privilege('anon','public.staynas_booking_analytics_events','SELECT')
     OR has_table_privilege('anon','public.staynas_booking_analytics_events','INSERT')
     OR has_table_privilege('anon','public.staynas_booking_attributions','SELECT') THEN
    RAISE EXCEPTION 'Anonymous role has direct access to CPS-06 analytics data';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='attribution_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_reservation_quotes' AND column_name='attribution_id'
  ) THEN
    RAISE EXCEPTION 'Quote and booking attribution linkage columns are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.bookings'::regclass AND tgname='staynas_booking_analytics_lifecycle' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.payment_events'::regclass AND tgname='staynas_payment_analytics_lifecycle' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Authoritative booking/payment analytics lifecycle triggers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=v_rel AND conname='staynas_booking_analytics_event_key_uidx'
  ) THEN
    RAISE EXCEPTION 'Property-scoped analytics event idempotency constraint is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('staynas_upsert_booking_attribution','staynas_record_booking_analytics_event')
      AND has_function_privilege('anon',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Anonymous role can execute server-only attribution or event-ingestion RPCs';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_report
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='staynas_get_booking_analytics';
  IF v_report IS NULL
     OR position('net_collected_by_currency' in v_report)=0
     OR position('confirmed_booking_value' in v_report)=0
     OR position('amount_paid' in v_report)=0
     OR position('outstanding' in v_report)=0
     OR position('refunds' in v_report)=0 THEN
    RAISE EXCEPTION 'Financial reconciliation or campaign currency separation is incomplete';
  END IF;
END
$test$;

SELECT pass('CPS-06 attribution, RLS, idempotency, lifecycle and currency contracts passed');
SELECT * FROM finish();
ROLLBACK;
