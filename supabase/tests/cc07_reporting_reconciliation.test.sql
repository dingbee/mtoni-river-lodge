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

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.commercial_reconciliation_statement_imports'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) OR has_table_privilege('anon','public.commercial_reconciliation_statement_imports','SELECT')
    OR has_table_privilege('authenticated','public.commercial_reconciliation_statement_imports','SELECT')
    OR has_table_privilege('service_role','public.commercial_reconciliation_statement_imports','UPDATE')
    OR has_table_privilege('service_role','public.commercial_reconciliation_statement_imports','DELETE')
    OR NOT has_table_privilege('service_role','public.commercial_reconciliation_statement_imports','INSERT') THEN
    RAISE EXCEPTION 'Statement import ledger RLS/grants violate least privilege';
  END IF;

  IF has_function_privilege('anon','public.commercial_create_reconciliation_run(uuid,text,timestamptz,timestamptz,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_import_reconciliation_statement(uuid,jsonb,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_create_reconciliation_run(uuid,text,timestamptz,timestamptz,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_import_reconciliation_statement(uuid,jsonb,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_complete_reconciliation_run(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Reconciliation service RPC grants violate least privilege';
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
  v_provider uuid;
  v_run_payload jsonb;
  v_replayed_id uuid;
  v_discrepancy_run uuid;
  v_discrepancy_item uuid;
  v_discrepancy_result jsonb;
  v_import jsonb;
  v_item_count integer;
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

  INSERT INTO public.commercial_provider_accounts(
    organisation_id,provider,provider_account_ref,supported_currencies,status
  ) VALUES (v_org,'manual','cc07-manual-provider','{TZS}','active')
  RETURNING id INTO v_provider;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  v_run_payload := public.commercial_create_reconciliation_run(
    v_provider,'TZS',now()-interval '3 days',now()-interval '2 days','cc07-idempotent-source',NULL
  );
  v_replayed_id := (v_run_payload->>'id')::uuid;
  IF (public.commercial_create_reconciliation_run(
    v_provider,'TZS',now()-interval '3 days',now()-interval '2 days','cc07-idempotent-source',NULL
  )->>'replayed')::boolean IS DISTINCT FROM true
  OR (public.commercial_create_reconciliation_run(
    v_provider,'TZS',now()-interval '3 days',now()-interval '2 days','cc07-idempotent-source',NULL
  )->>'id')::uuid IS DISTINCT FROM v_replayed_id THEN
    RAISE EXCEPTION 'Provider-period reconciliation run creation was not idempotent';
  END IF;

  v_import := public.commercial_import_reconciliation_statement(
    v_replayed_id,
    '[{"itemType":"matched","internalPaymentId":null,"providerRef":"cc07-statement-row-1","expectedAmountMinor":10000,"observedAmountMinor":10000,"expectedCurrency":"TZS","observedCurrency":"TZS","evidence":{"test":true},"resolutionStatus":"resolved","resolutionRef":"exact_match"}]'::jsonb,
    NULL
  );
  IF (v_import->>'findingCount')::integer <> 1 OR (v_import->>'replayed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'First provider statement import was not committed';
  END IF;
  v_import := public.commercial_import_reconciliation_statement(
    v_replayed_id,
    '[{"itemType":"matched","internalPaymentId":null,"providerRef":"cc07-statement-row-1","expectedAmountMinor":10000,"observedAmountMinor":10000,"expectedCurrency":"TZS","observedCurrency":"TZS","evidence":{"test":true},"resolutionStatus":"resolved","resolutionRef":"exact_match"}]'::jsonb,
    NULL
  );
  SELECT count(*) INTO v_item_count FROM public.commercial_reconciliation_items WHERE run_id=v_replayed_id;
  IF (v_import->>'replayed')::boolean IS DISTINCT FROM true OR v_item_count <> 1 THEN
    RAISE EXCEPTION 'Repeated statement import created duplicate reconciliation items';
  END IF;
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

  PERFORM public.commercial_resolve_reconciliation_item(v_item,'cc07-test-resolution',NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_items
    WHERE id=v_item AND resolution_status='resolved' AND resolution_ref='cc07-test-resolution'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_item_events
    WHERE item_id=v_item AND event_type='resolved' AND resolution_ref='cc07-test-resolution'
  ) THEN
    RAISE EXCEPTION 'Resolution and lifecycle evidence were not committed together';
  END IF;

  PERFORM public.commercial_complete_reconciliation_run(v_run,NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_runs WHERE id=v_run AND status='completed'
  ) THEN
    RAISE EXCEPTION 'Reconciliation run did not close after all exceptions were resolved';
  END IF;

  v_discrepancy_result := public.commercial_create_reconciliation_run(
    v_provider,'TZS',now()-interval '5 days',now()-interval '4 days','cc07-discrepancy-source',NULL
  );
  v_discrepancy_run := (v_discrepancy_result->>'id')::uuid;
  PERFORM public.commercial_import_reconciliation_statement(
    v_discrepancy_run,
    '[{"itemType":"amount_mismatch","internalPaymentId":null,"providerRef":"cc07-mismatch-row","expectedAmountMinor":10000,"observedAmountMinor":9000,"expectedCurrency":"TZS","observedCurrency":"TZS","evidence":{"test":true},"resolutionStatus":"unresolved","resolutionRef":null}]'::jsonb,
    NULL
  );
  v_discrepancy_result := public.commercial_complete_reconciliation_run(v_discrepancy_run,NULL);
  IF v_discrepancy_result->>'status' <> 'discrepancy' OR NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_runs WHERE id=v_discrepancy_run AND status='discrepancy'
  ) THEN
    RAISE EXCEPTION 'Unresolved reconciliation exception did not block clean run closure';
  END IF;
  SELECT id INTO v_discrepancy_item FROM public.commercial_reconciliation_items
    WHERE run_id=v_discrepancy_run AND item_type='amount_mismatch';
  PERFORM public.commercial_resolve_reconciliation_item(v_discrepancy_item,'cc07-final-resolution',NULL);
  v_discrepancy_result := public.commercial_complete_reconciliation_run(v_discrepancy_run,NULL);
  IF v_discrepancy_result->>'status' <> 'completed' OR NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_runs WHERE id=v_discrepancy_run AND status='completed'
  ) THEN
    RAISE EXCEPTION 'Discrepancy run did not close after exception resolution';
  END IF;
END
$data_test$;

ROLLBACK;
