-- SN-OC-04 baseline source-contract and tenant-isolation checks.
-- Executed only after the complete migration chain in the isolated Supabase CI stack.
BEGIN;
DO $sn_oc_04_contract$
DECLARE
  v_table text;
  v_required text[] := ARRAY[
    'ai_concierge_sessions','ai_concierge_messages','ai_omnichannel_messages',
    'ai_concierge_leads','ai_concierge_attributions','ai_concierge_feedback',
    'ai_escalations','campaign_attribution','bookings',
    'knowledge_documents','knowledge_document_versions','knowledge_chunks',
    'ai_knowledge_search_log'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_required LOOP
    IF to_regclass(format('public.%I',v_table)) IS NULL THEN
      RAISE EXCEPTION 'SN-OC-04 required source table missing: %',v_table;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname=v_table) THEN
      RAISE EXCEPTION 'SN-OC-04 RLS is not enabled on source table: %',v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_omnichannel_messages'
      AND column_name='property_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_omnichannel_messages'
      AND column_name='occurred_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_omnichannel_messages'
      AND column_name='actor_type'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 omnichannel message provenance contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings'
      AND column_name='confirmed_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings'
      AND column_name='cancelled_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings'
      AND column_name='currency'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 authoritative booking outcome/financial contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_concierge_attributions'
      AND column_name='booking_id'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 attribution-to-booking linkage is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_escalations'
      AND column_name='resolved_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_escalations'
      AND column_name='assigned_to'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_escalations'
      AND column_name='status'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 escalation current-state/resolution contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_properties'
      AND column_name='timezone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_properties'
      AND column_name='currency'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 property timezone/currency contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='knowledge_documents'
      AND column_name='current_version'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='knowledge_chunks'
      AND column_name='property_id'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 property-scoped versioned knowledge contract is incomplete';
  END IF;
END
$sn_oc_04_contract$;
ROLLBACK;
