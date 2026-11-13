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
    WHERE table_schema='public' AND table_name='ai_concierge_leads'
      AND column_name='consent_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_concierge_leads'
      AND column_name='consent_version'
  ) THEN
    RAISE EXCEPTION 'SN-OC-04 lead consent evidence contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_escalations'
      AND column_name='property_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_escalations'
      AND column_name='acknowledged_at'
  ) OR NOT EXISTS (
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
DO $sn_oc_04_sla_contract$
BEGIN
  IF to_regclass('public.ai_escalation_sla_policies') IS NULL
     OR to_regclass('public.ai_escalation_events') IS NULL
     OR to_regclass('public.ai_escalation_sla_alerts') IS NULL
     OR to_regclass('public.ai_escalation_sla_policy_events') IS NULL THEN
    RAISE EXCEPTION 'SN-OC-04 SLA policy, lifecycle and alert tables are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalations' AND column_name='assigned_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalations' AND column_name='assignment_due_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalations' AND column_name='acknowledgement_due_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalations' AND column_name='resolution_due_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalations' AND column_name='sla_cycle_started_at') THEN
    RAISE EXCEPTION 'SN-OC-04 escalation deadline and cycle fields are incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalation_sla_policies' AND column_name='operating_hours')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalation_sla_policies' AND column_name='warning_percent')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_escalation_sla_policies' AND column_name='reason_priority_map') THEN
    RAISE EXCEPTION 'SN-OC-04 configurable policy contract is incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='staynas_process_concierge_sla_alerts')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='staynas_sla_add_minutes')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='staynas_sla_business_minutes') THEN
    RAISE EXCEPTION 'SN-OC-04 SLA calculation and alert worker functions are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.ai_escalations'::regclass
      AND conname='ai_escalations_status_check'
      AND pg_get_constraintdef(oid) LIKE '%acknowledged%'
  ) THEN
    RAISE EXCEPTION 'SN-RT-01 must allow the acknowledged escalation lifecycle state';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_escalation_sla_policies'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_escalation_events'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_escalation_sla_alerts'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_escalation_sla_policy_events'::regclass) THEN
    RAISE EXCEPTION 'SN-OC-04 SLA tables must enforce row-level security';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='staynas-concierge-sla-monitor' AND schedule='* * * * *') THEN
    RAISE EXCEPTION 'SN-OC-04 minute-level SLA monitor must be scheduled';
  END IF;
END
$sn_oc_04_sla_contract$;

ROLLBACK;
