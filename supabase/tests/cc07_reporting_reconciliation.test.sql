-- CC-07 reporting and reconciliation persistence contracts.
BEGIN;
DO $test$
DECLARE
  v_constraint text;
  v_view_security boolean;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint
  FROM pg_constraint
  WHERE conrelid='public.commercial_reconciliation_items'::regclass
    AND conname='commercial_reconciliation_items_item_type_check';
  IF v_constraint IS NULL OR position('status_mismatch' in v_constraint)=0 THEN
    RAISE EXCEPTION 'Reconciliation item contract must persist status_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.commercial_reconciliation_item_events'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Reconciliation lifecycle evidence must enforce RLS and FORCE RLS';
  END IF;
  IF has_table_privilege('anon','public.commercial_reconciliation_item_events','SELECT')
    OR has_table_privilege('authenticated','public.commercial_reconciliation_item_events','SELECT')
    OR has_table_privilege('authenticated','public.commercial_reconciliation_item_events','INSERT')
    OR has_table_privilege('service_role','public.commercial_reconciliation_item_events','UPDATE')
    OR has_table_privilege('service_role','public.commercial_reconciliation_item_events','DELETE')
    OR NOT has_table_privilege('service_role','public.commercial_reconciliation_item_events','INSERT') THEN
    RAISE EXCEPTION 'Reconciliation lifecycle evidence grants violate least privilege';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.commercial_record_reconciliation_item_event(uuid,text,uuid,text,text,text,jsonb,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.commercial_record_reconciliation_item_event(uuid,text,uuid,text,text,text,jsonb,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.commercial_record_reconciliation_item_event(uuid,text,uuid,text,text,text,jsonb,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Reconciliation event RPC grants violate service-only boundary';
  END IF;

  IF to_regclass('public.commercial_receivables_aging') IS NULL
    OR to_regclass('public.commercial_revenue_invoice_facts') IS NULL
    OR to_regclass('public.commercial_revenue_collection_facts') IS NULL
    OR to_regclass('public.commercial_revenue_unallocated_facts') IS NULL THEN
    RAISE EXCEPTION 'CC-07 reporting views are incomplete';
  END IF;
  IF has_table_privilege('anon','public.commercial_receivables_aging','SELECT')
    OR has_table_privilege('authenticated','public.commercial_receivables_aging','SELECT')
    OR NOT has_table_privilege('service_role','public.commercial_receivables_aging','SELECT') THEN
    RAISE EXCEPTION 'Receivables reporting view grants violate founder/service boundary';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname='public' AND viewname='commercial_revenue_invoice_facts'
      AND definition ILIKE '%commercial_invoice_receivables%'
  ) THEN
    RAISE EXCEPTION 'Invoice revenue facts must derive from authoritative receivables';
  END IF;
END
$test$;

DO $data_test$
DECLARE
  v_org uuid := '97000000-0000-4000-8000-000000000001';
  v_run uuid;
  v_item uuid;
  v_event uuid;
  v_blocked boolean := false;
BEGIN
  INSERT INTO public.staynas_organisations(id,slug,name,status)
  VALUES (v_org,'cc07-reconciliation-test','CC07 Reconciliation Test','active');
  INSERT INTO public.commercial_reconciliation_runs(
    organisation_id,currency,period_start,period_end,source_ref
  ) VALUES (v_org,'TZS',now()-interval '1 day',now(),'cc07-test-statement')
  RETURNING id INTO v_run;
  INSERT INTO public.commercial_reconciliation_items(
    run_id,item_type,provider_ref,expected_amount_minor,observed_amount_minor,
    expected_currency,observed_currency,evidence
  ) VALUES (
    v_run,'status_mismatch','cc07-provider-ref',10000,10000,'TZS','TZS','{"test":true}'::jsonb
  ) RETURNING id INTO v_item;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  v_event := public.commercial_record_reconciliation_item_event(
    v_item,'opened',NULL,'service_principal','provider_status_conflict',
    'Opened by CC-07 contract test','{"source":"isolated-test"}'::jsonb,NULL
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_item_events
    WHERE id=v_event AND item_id=v_item AND event_type='opened'
  ) THEN RAISE EXCEPTION 'Reconciliation lifecycle event was not persisted'; END IF;

  BEGIN
    UPDATE public.commercial_reconciliation_item_events SET note='tampered' WHERE id=v_event;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Reconciliation lifecycle evidence was mutable'; END IF;
END
$data_test$;

ROLLBACK;
