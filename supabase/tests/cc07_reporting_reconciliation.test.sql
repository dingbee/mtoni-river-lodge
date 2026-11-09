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

  IF to_regclass('public.commercial_subscription_revenue_movements') IS NULL
    OR to_regclass('public.commercial_subscription_revenue_movement_facts') IS NULL
    OR to_regclass('public.commercial_subscription_recurring_value_facts') IS NULL
    OR to_regclass('public.commercial_founder_revenue_invoice_facts') IS NULL
    OR to_regclass('public.commercial_founder_revenue_collection_facts') IS NULL
    OR to_regclass('public.commercial_founder_revenue_reversal_facts') IS NULL
    OR to_regclass('public.commercial_founder_receivables_aging') IS NULL
    OR to_regclass('public.commercial_subscription_invoice_consistency_facts') IS NULL
    OR to_regclass('public.commercial_subscription_entitlement_consistency_facts') IS NULL THEN
    RAISE EXCEPTION 'CC-07 recurring revenue, movement or precision-safe reporting views are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.commercial_subscription_revenue_movements'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) OR has_table_privilege('anon','public.commercial_subscription_revenue_movements','SELECT')
    OR has_table_privilege('authenticated','public.commercial_subscription_revenue_movements','SELECT')
    OR has_table_privilege('service_role','public.commercial_subscription_revenue_movements','UPDATE')
    OR has_table_privilege('service_role','public.commercial_subscription_revenue_movements','DELETE')
    OR NOT has_table_privilege('service_role','public.commercial_subscription_revenue_movements','INSERT') THEN
    RAISE EXCEPTION 'Subscription revenue movement ledger grants violate append-only founder boundary';
  END IF;
  IF has_function_privilege('anon','public.commercial_replace_active_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,text,text,timestamptz,text,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_replace_active_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,text,text,timestamptz,text,text,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_replace_active_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,text,text,timestamptz,text,text,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Subscription replacement RPC grants violate service-only boundary';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public'
      AND table_name='commercial_founder_revenue_invoice_facts' AND column_name='net_invoiced_minor')<>'text'
    OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public'
      AND table_name='commercial_founder_revenue_collection_facts' AND column_name='net_collected_minor')<>'text'
    OR (SELECT data_type FROM information_schema.columns WHERE table_schema='public'
      AND table_name='commercial_founder_receivables_aging' AND column_name='outstanding_minor')<>'text' THEN
    RAISE EXCEPTION 'Founder reporting projections must serialize NUMERIC(20,0) as text';
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
    '[{"item_type":"matched","internal_payment_id":null,"provider_ref":"cc07-statement-row-1","expected_amount_minor":10000,"observed_amount_minor":10000,"expected_currency":"TZS","observed_currency":"TZS","evidence":{"test":true},"resolution_status":"resolved","resolution_ref":"exact_match"}]'::jsonb,
    NULL
  );
  IF (v_import->>'findingCount')::integer <> 1 OR (v_import->>'replayed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'First provider statement import was not committed';
  END IF;
  v_import := public.commercial_import_reconciliation_statement(
    v_replayed_id,
    '[{"item_type":"matched","internal_payment_id":null,"provider_ref":"cc07-statement-row-1","expected_amount_minor":10000,"observed_amount_minor":10000,"expected_currency":"TZS","observed_currency":"TZS","evidence":{"test":true},"resolution_status":"resolved","resolution_ref":"exact_match"}]'::jsonb,
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

  PERFORM public.commercial_record_reconciliation_item_event(
    v_item,'review_started',NULL,'founder_admin','founder_review_started',NULL,'{}'::jsonb,NULL
  );
  IF NOT EXISTS (SELECT 1 FROM public.commercial_reconciliation_items WHERE id=v_item AND resolution_status='reviewed') THEN
    RAISE EXCEPTION 'Review-start lifecycle transition did not update exception state';
  END IF;
  PERFORM public.commercial_resolve_reconciliation_item(v_item,'cc07-test-resolution',NULL);
  PERFORM public.commercial_record_reconciliation_item_event(
    v_item,'reopened',NULL,'founder_admin','founder_exception_reopened',NULL,'{"reason":"new evidence"}'::jsonb,NULL
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_items
    WHERE id=v_item AND resolution_status='unresolved' AND resolution_ref IS NULL
  ) THEN
    RAISE EXCEPTION 'Reopened exception did not return to unresolved state';
  END IF;
  PERFORM public.commercial_resolve_reconciliation_item(v_item,'cc07-test-resolution-final',NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_items
    WHERE id=v_item AND resolution_status='resolved' AND resolution_ref='cc07-test-resolution'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_item_events
    WHERE item_id=v_item AND event_type='resolved' AND resolution_ref='cc07-test-resolution-final'
  ) THEN
    RAISE EXCEPTION 'Resolution and lifecycle evidence were not committed together';
  END IF;

  PERFORM public.commercial_complete_reconciliation_run(v_run,NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_reconciliation_runs WHERE id=v_run AND status='completed'
  ) THEN
    RAISE EXCEPTION 'Reconciliation run did not close after all exceptions were resolved';
  END IF;
  v_import := public.commercial_import_reconciliation_statement(
    v_replayed_id,
    '[{"item_type":"matched","internal_payment_id":null,"provider_ref":"cc07-statement-row-1","expected_amount_minor":10000,"observed_amount_minor":10000,"expected_currency":"TZS","observed_currency":"TZS","evidence":{"test":true},"resolution_status":"resolved","resolution_ref":"exact_match"}]'::jsonb,
    NULL
  );
  IF (v_import->>'replayed')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Completed statement import did not return its idempotent replay';
  END IF;
  BEGIN
    PERFORM public.commercial_import_reconciliation_statement(
      v_replayed_id,
      '[{"item_type":"matched","internal_payment_id":null,"provider_ref":"different-payload","expected_amount_minor":10000,"observed_amount_minor":10000,"expected_currency":"TZS","observed_currency":"TZS","evidence":{"test":true},"resolution_status":"resolved","resolution_ref":"exact_match"}]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'Conflicting provider statement replay was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;
  PERFORM public.commercial_resolve_reconciliation_item(v_item,'cc07-test-resolution-final',NULL);

  v_discrepancy_result := public.commercial_create_reconciliation_run(
    v_provider,'TZS',now()-interval '5 days',now()-interval '4 days','cc07-discrepancy-source',NULL
  );
  v_discrepancy_run := (v_discrepancy_result->>'id')::uuid;
  PERFORM public.commercial_import_reconciliation_statement(
    v_discrepancy_run,
    '[{"item_type":"amount_mismatch","internal_payment_id":null,"provider_ref":"cc07-mismatch-row","expected_amount_minor":10000,"observed_amount_minor":9000,"expected_currency":"TZS","observed_currency":"TZS","evidence":{"test":true},"resolution_status":"unresolved","resolution_ref":null}]'::jsonb,
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



DO $revenue_test$
DECLARE
  v_founder_org uuid := '97000000-0000-4000-8000-000000000002';
  v_customer_org uuid := '97000000-0000-4000-8000-000000000003';
  v_user uuid := '97000000-0000-4000-8000-000000000004';
  v_account uuid := '97000000-0000-4000-8000-000000000005';
  v_old_sub uuid := '97000000-0000-4000-8000-000000000006';
  v_invoice uuid := '97000000-0000-4000-8000-000000000007';
  v_result jsonb;
  v_second_result jsonb;
  v_first_new_sub uuid;
  v_final_sub uuid;
  v_new_invoice uuid := '97000000-0000-4000-8000-000000000008';
  v_usd_org uuid := '97000000-0000-4000-8000-000000000009';
  v_usd_account uuid := '97000000-0000-4000-8000-00000000000a';
  v_tzs_new_sub uuid := '97000000-0000-4000-8000-00000000000b';
  v_usd_sub uuid := '97000000-0000-4000-8000-00000000000c';
  v_trial_org uuid := '97000000-0000-4000-8000-00000000000d';
  v_trial_account uuid := '97000000-0000-4000-8000-00000000000e';
  v_trial_sub uuid := '97000000-0000-4000-8000-00000000000f';
  v_trial_started timestamptz := now();
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_churn_result jsonb;
  v_movement public.commercial_subscription_revenue_movements%ROWTYPE;
  v_old_snapshot jsonb := '{"currency":"TZS","planCode":"essential","planVersion":1,"billingTerm":"monthly","propertyCount":1,"priceCode":"test-essential-monthly","quoteRequired":false,"total":100000,"lineItems":[{"kind":"plan_base","code":"essential","quantity":1,"unitAmountMinor":100000,"amountMinor":100000}],"addonCodes":[]}'::jsonb;
  v_new_snapshot jsonb := '{"currency":"TZS","planCode":"professional","planVersion":1,"billingTerm":"monthly","propertyCount":1,"priceCode":"test-professional-monthly","quoteRequired":false,"total":150000,"lineItems":[{"kind":"plan_base","code":"professional","quantity":1,"unitAmountMinor":150000,"amountMinor":150000}],"addonCodes":[]}'::jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user);
  INSERT INTO public.staynas_organisations(id,slug,name,status) VALUES
    (v_founder_org,'cc07-founder-test','CC07 Founder Test','active'),
    (v_customer_org,'cc07-customer-test','CC07 Customer Test','active');
  INSERT INTO public.commercial_founder_tenant_config(singleton,founder_organisation_id)
    VALUES (true,v_founder_org);
  INSERT INTO public.commercial_founder_admin_memberships(
    principal_id,organisation_id,status,verified_at
  ) VALUES (v_user,v_founder_org,'active',now());
  INSERT INTO public.commercial_accounts(id,organisation_id,status)
    VALUES (v_account,v_customer_org,'active');
  INSERT INTO public.commercial_subscriptions(
    id,account_id,plan_code,plan_version,currency,billing_term,property_count,addon_codes,
    price_resolution_ref,accepted_price_snapshot,quote_required,commercial_acceptance_ref,
    status,activated_at,current_period_starts_at,current_period_ends_at
  ) VALUES (
    v_old_sub,v_account,'essential',1,'TZS','monthly',1,ARRAY[]::text[],
    'cc07-old-price',v_old_snapshot,false,'cc07-old-acceptance',
    'active',now()-interval '20 days',now()-interval '20 days',now()+interval '10 days'
  );
  INSERT INTO public.commercial_subscription_events(
    account_id,subscription_id,event_type,occurred_at,idempotency_key,actor_user_id,
    actor_organisation_id,actor_role,reason_code,event_metadata
  ) VALUES
    (v_account,v_old_sub,'created',now()-interval '20 days','cc07-old-created',v_user,v_founder_org,'founder_admin','test_setup','{}'::jsonb),
    (v_account,v_old_sub,'activate_paid',now()-interval '20 days','cc07-old-activated',v_user,v_founder_org,'founder_admin','test_setup',
      '{"currency":"TZS","priceResolutionRef":"cc07-old-price"}'::jsonb);

  INSERT INTO public.commercial_invoices(
    id,organisation_id,account_id,subscription_id,invoice_number,idempotency_key,
    billing_period_start,billing_period_end,currency,billing_term,status,issued_at,due_at,
    subtotal_minor,tax_minor,discount_minor,total_minor,amount_paid_minor,
    pricing_snapshot,tax_snapshot
  ) VALUES (
    v_invoice,v_customer_org,v_account,v_old_sub,'CC07-TEST-INV-001','cc07-invoice-test-key',
    now()-interval '20 days',now()+interval '10 days','TZS','monthly','issued',
    now()-interval '20 days',now()+interval '10 days',100000,0,0,100000,100000,
    '{"test":true}'::jsonb,'{"test":true}'::jsonb
  );
  PERFORM public.commercial_post_invoice_adjustment(
    v_invoice,'CC07-DEBIT-001','debit_note',50000,'TZS',
    'approved_plan_expansion','CC07-APPROVAL-001',v_user
  );

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  BEGIN
    PERFORM public.commercial_replace_active_subscription_for_founder(
      v_old_sub,'essential',1,'USD','monthly',1,ARRAY[]::text[],
      'cc07-invalid-usd-price',
      '{"currency":"USD","planCode":"essential","planVersion":1,"billingTerm":"monthly","propertyCount":1,"priceCode":"invalid-usd","quoteRequired":false,"total":100000,"lineItems":[{"kind":"plan_base","code":"essential","quantity":1,"unitAmountMinor":100000,"amountMinor":100000}],"addonCodes":[]}'::jsonb,
      'cc07-invalid-currency-acceptance','not-applicable',now()+interval '10 days',
      'cc07-invalid-currency-key','invalid_currency_test',v_user,v_founder_org
    );
    RAISE EXCEPTION 'Subscription replacement accepted a cross-currency contract';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.commercial_subscription_revenue_movements WHERE previous_subscription_id=v_old_sub)
    OR NOT EXISTS (SELECT 1 FROM public.commercial_subscriptions WHERE id=v_old_sub AND status='active') THEN
    RAISE EXCEPTION 'Rejected currency change mutated the subscription ledger';
  END IF;
  v_result := public.commercial_replace_active_subscription_for_founder(
    v_old_sub,'professional',1,'TZS','monthly',1,ARRAY[]::text[],
    'cc07-new-price',v_new_snapshot,'cc07-new-acceptance','CC07-DEBIT-001',
    now()+interval '10 days','cc07-replace-subscription-001','approved_plan_expansion',
    v_user,v_founder_org
  );
  IF v_result->>'movementType' <> 'expansion' OR v_result->>'deltaMrrMinor' <> '50000' THEN
    RAISE EXCEPTION 'Accepted price replacement did not record exact expansion MRR';
  END IF;
  v_first_new_sub := (v_result->>'subscriptionId')::uuid;
  SELECT * INTO v_movement FROM public.commercial_subscription_revenue_movements
    WHERE id=(v_result->>'movementId')::uuid;
  IF v_movement.previous_mrr_minor<>100000 OR v_movement.new_mrr_minor<>150000
    OR v_movement.delta_mrr_minor<>50000 OR v_movement.currency<>'TZS' THEN
    RAISE EXCEPTION 'Stored subscription MRR movement values are inconsistent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commercial_subscriptions WHERE id=v_old_sub AND status='cancelled')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_subscriptions WHERE id=(v_result->>'subscriptionId')::uuid AND status='active') THEN
    RAISE EXCEPTION 'Subscription replacement did not atomically close old and activate new contract';
  END IF;
  IF (SELECT count(*) FROM public.commercial_subscription_revenue_movement_facts
      WHERE account_id=v_account AND movement_type='expansion')<>1
    OR (SELECT count(*) FROM public.commercial_subscription_revenue_movement_facts
      WHERE account_id=v_account AND movement_type='churned')<>0
    OR (SELECT count(*) FROM public.commercial_subscription_revenue_movement_facts
      WHERE account_id=v_account AND movement_type='new')<>1 THEN
    RAISE EXCEPTION 'Expansion replacement was incorrectly classified as new business or churn';
  END IF;
  IF (SELECT mrr_minor FROM public.commercial_subscription_recurring_value_facts
      WHERE subscription_id=(v_result->>'subscriptionId')::uuid)<>'150000' THEN
    RAISE EXCEPTION 'Current recurring contract value view returned incorrect MRR';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_subscription_invoice_consistency_facts
    WHERE subscription_id=(v_result->>'subscriptionId')::uuid
      AND exception_type='missing_current_period_invoice'
  ) THEN
    RAISE EXCEPTION 'Missing current-period invoice was not detected for the new paid subscription';
  END IF;
  INSERT INTO public.commercial_entitlement_assignments(
    organisation_id,account_id,subscription_id,feature_code,source_type,source_ref,
    status,effective_from,context_snapshot
  ) VALUES (
    v_customer_org,v_account,v_old_sub,'reservations','plan','cc07-test-plan',
    'active',now()-interval '1 day','{"test":true}'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_subscription_entitlement_consistency_facts
    WHERE subscription_id=v_old_sub AND exception_type='active_entitlement_on_inactive_subscription'
  ) THEN
    RAISE EXCEPTION 'Active entitlement attached to cancelled subscription was not detected';
  END IF;

  SELECT current_period_starts_at,current_period_ends_at INTO v_period_start,v_period_end
    FROM public.commercial_subscriptions WHERE id=v_first_new_sub;
  INSERT INTO public.commercial_invoices(
    id,organisation_id,account_id,subscription_id,invoice_number,idempotency_key,
    billing_period_start,billing_period_end,currency,billing_term,status,issued_at,due_at,
    subtotal_minor,tax_minor,discount_minor,total_minor,amount_paid_minor,pricing_snapshot,tax_snapshot
  ) VALUES (
    v_new_invoice,v_customer_org,v_account,v_first_new_sub,'CC07-TEST-INV-002','cc07-invoice-new-02',
    v_period_start,v_period_end,'TZS','monthly','issued',now(),v_period_end,
    150000,0,0,150000,150000,'{"test":true}'::jsonb,'{"test":true}'::jsonb
  );
  PERFORM public.commercial_post_invoice_adjustment(
    v_new_invoice,'CC07-CREDIT-001','credit_note',60000,'TZS',
    'approved_plan_contraction','CC07-APPROVAL-002',v_user
  );
  v_second_result := public.commercial_replace_active_subscription_for_founder(
    v_first_new_sub,'essential',1,'TZS','monthly',1,ARRAY[]::text[],
    'cc07-lower-price', '{"currency":"TZS","planCode":"essential","planVersion":1,"billingTerm":"monthly","propertyCount":1,"priceCode":"test-essential-lower","quoteRequired":false,"total":90000,"lineItems":[{"kind":"plan_base","code":"essential","quantity":1,"unitAmountMinor":90000,"amountMinor":90000}],"addonCodes":[]}'::jsonb,
    'cc07-lower-acceptance','CC07-CREDIT-001',v_period_end,
    'cc07-replace-subscription-002','approved_plan_contraction',v_user,v_founder_org
  );
  IF v_second_result->>'movementType'<>'contraction' OR v_second_result->>'deltaMrrMinor'<>'-60000' THEN
    RAISE EXCEPTION 'Accepted price replacement did not record exact contraction MRR';
  END IF;
  v_final_sub := (v_second_result->>'subscriptionId')::uuid;
  v_churn_result := public.commercial_apply_subscription_command(
    v_account,v_final_sub,'cancel_immediately','cc07-final-churn-key',
    v_user,v_founder_org,'founder_admin','customer_churn',NULL,NULL
  );
  IF v_churn_result->>'status'<>'cancelled' THEN
    RAISE EXCEPTION 'Paid subscription churn command did not persist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_subscription_revenue_movement_facts
    WHERE subscription_id=v_final_sub AND movement_type='churned' AND movement_mrr_minor=90000
  ) THEN
    RAISE EXCEPTION 'Paid churn MRR was not derived from terminal lifecycle event';
  END IF;
  IF (SELECT sum(net_new_mrr_minor) FROM public.commercial_subscription_revenue_movement_facts
      WHERE account_id=v_account)<>0 THEN
    RAISE EXCEPTION 'New, expansion, contraction and churn MRR do not reconcile to zero net movement';
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='commercial_founder_subscription_movement_facts'
        AND column_name='net_new_mrr_minor')<>'text' THEN
    RAISE EXCEPTION 'Founder movement facts must preserve exact numeric values as text';
  END IF;

  -- Explicit currency isolation: no USD amount is converted into the TZS ledger.
  INSERT INTO public.staynas_organisations(id,slug,name,status)
    VALUES (v_usd_org,'cc07-usd-test','CC07 USD Customer','active');
  INSERT INTO public.commercial_accounts(id,organisation_id,status)
    VALUES (v_usd_account,v_usd_org,'active');
  INSERT INTO public.commercial_subscriptions(
    id,account_id,plan_code,plan_version,currency,billing_term,property_count,addon_codes,
    price_resolution_ref,accepted_price_snapshot,quote_required,commercial_acceptance_ref,
    status,activated_at,current_period_starts_at,current_period_ends_at
  ) VALUES
    (v_tzs_new_sub,v_account,'essential',1,'TZS','monthly',1,ARRAY[]::text[],
      'cc07-tzs-current','{"currency":"TZS","planCode":"essential","planVersion":1,"billingTerm":"monthly","propertyCount":1,"priceCode":"tzs-current","quoteRequired":false,"total":200000,"lineItems":[{"kind":"plan_base","code":"essential","quantity":1,"unitAmountMinor":200000,"amountMinor":200000}],"addonCodes":[]}'::jsonb,
      false,'cc07-tzs-acceptance','active',now(),now(),now()+interval '30 days'),
    (v_usd_sub,v_usd_account,'essential',1,'USD','annual',1,ARRAY[]::text[],
      'cc07-usd-current','{"currency":"USD","planCode":"essential","planVersion":1,"billingTerm":"annual","propertyCount":1,"priceCode":"usd-current","quoteRequired":false,"total":3000000,"lineItems":[{"kind":"plan_base","code":"essential","quantity":1,"unitAmountMinor":3000000,"amountMinor":3000000}],"addonCodes":[]}'::jsonb,
      false,'cc07-usd-acceptance','active',now(),now(),now()+interval '365 days');
  IF (SELECT mrr_minor FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_tzs_new_sub)<>'200000'
    OR (SELECT arr_minor FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_tzs_new_sub)<>'2400000'
    OR (SELECT currency FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_tzs_new_sub)<>'TZS'
    OR (SELECT mrr_minor FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_usd_sub)<>'250000'
    OR (SELECT arr_minor FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_usd_sub)<>'3000000'
    OR (SELECT currency FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_usd_sub)<>'USD' THEN
    RAISE EXCEPTION 'TZS/USD MRR/ARR facts were mixed, annualized incorrectly or converted';
  END IF;

  -- Trial activations must not appear in paid MRR or new-MRR movement facts.
  INSERT INTO public.staynas_organisations(id,slug,name,status)
    VALUES (v_trial_org,'cc07-trial-test','CC07 Trial Customer','active');
  INSERT INTO public.commercial_accounts(id,organisation_id,status)
    VALUES (v_trial_account,v_trial_org,'active');
  INSERT INTO public.commercial_subscriptions(
    id,account_id,plan_code,plan_version,currency,billing_term,property_count,addon_codes,
    price_resolution_ref,accepted_price_snapshot,quote_required,status,activated_at,
    trial_policy_version,trial_started_at,trial_ends_at,created_by
  ) VALUES (
    v_trial_sub,v_trial_account,'essential',1,'TZS','monthly',1,ARRAY[]::text[],
    'cc07-trial-price','{"currency":"TZS","planCode":"essential","planVersion":1,"billingTerm":"monthly","propertyCount":1,"priceCode":"trial-price","quoteRequired":false,"total":100000,"lineItems":[{"kind":"plan_base","code":"essential","quantity":1,"unitAmountMinor":100000,"amountMinor":100000}],"addonCodes":[]}'::jsonb,
    false,'trialing',v_trial_started,1,v_trial_started,v_trial_started+interval '336 hours',v_user
  );
  INSERT INTO public.commercial_trial_claims(
    account_id,subscription_id,policy_version,claimed_at,trial_started_at,trial_ends_at
  ) VALUES (
    v_trial_account,v_trial_sub,1,v_trial_started,v_trial_started,v_trial_started+interval '336 hours'
  );
  INSERT INTO public.commercial_subscription_events(
    account_id,subscription_id,event_type,occurred_at,idempotency_key,actor_user_id,
    actor_organisation_id,actor_role,reason_code,event_metadata
  ) VALUES (
    v_trial_account,v_trial_sub,'activate_trial',v_trial_started,'cc07-trial-activated',
    v_user,v_founder_org,'founder_admin','test_trial','{}'::jsonb
  );
  IF EXISTS (SELECT 1 FROM public.commercial_subscription_recurring_value_facts WHERE subscription_id=v_trial_sub)
    OR EXISTS (SELECT 1 FROM public.commercial_subscription_revenue_movement_facts WHERE subscription_id=v_trial_sub) THEN
    RAISE EXCEPTION 'Trial subscription was incorrectly included in paid MRR';
  END IF;

  -- Aging boundaries on both sides of 30, 60 and 90 days.
  INSERT INTO public.commercial_invoices(
    organisation_id,account_id,subscription_id,invoice_number,idempotency_key,
    billing_period_start,billing_period_end,currency,billing_term,status,issued_at,due_at,
    subtotal_minor,tax_minor,discount_minor,total_minor,amount_paid_minor,pricing_snapshot,tax_snapshot
  )
  SELECT v_customer_org,v_account,v_final_sub,'CC07-AGING-'||x.label,'cc07-aging-'||x.label,
    now()-interval '150 days'+(x.n||' days')::interval,
    now()-interval '120 days'+(x.n||' days')::interval,
    'TZS','monthly','issued',now()-interval '120 days',x.due_at,
    1000,0,0,1000,0,'{"test":true}'::jsonb,'{"test":true}'::jsonb
  FROM (VALUES
    (1,'current',now()+interval '1 day'),
    (2,'d30_before',now()-interval '30 days'+interval '1 second'),
    (3,'d30_after',now()-interval '30 days'-interval '1 second'),
    (4,'d60_before',now()-interval '60 days'+interval '1 second'),
    (5,'d60_after',now()-interval '60 days'-interval '1 second'),
    (6,'d90_before',now()-interval '90 days'+interval '1 second'),
    (7,'d90_after',now()-interval '90 days'-interval '1 second')
  ) AS x(n,label,due_at);
  IF NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-current') AND aging_bucket='current')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-d30_before') AND aging_bucket='1_30')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-d30_after') AND aging_bucket='31_60')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-d60_before') AND aging_bucket='31_60')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-d60_after') AND aging_bucket='61_90')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-d90_before') AND aging_bucket='61_90')
    OR NOT EXISTS (SELECT 1 FROM public.commercial_receivables_aging WHERE invoice_id IN
      (SELECT id FROM public.commercial_invoices WHERE invoice_number='CC07-AGING-d90_after') AND aging_bucket='over_90') THEN
    RAISE EXCEPTION 'Receivables aging boundary classification failed';
  END IF;
END
$revenue_test$;

ROLLBACK;
