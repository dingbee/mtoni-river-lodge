-- CC-04 durable financial ledger tests. Run after CC-03 migrations in isolated PostgreSQL 17.
BEGIN;
DO $test$
DECLARE
  v_org uuid := '71000000-0000-4000-8000-000000000001';
  v_user uuid := '72000000-0000-4000-8000-000000000001';
  v_account uuid := '73000000-0000-4000-8000-000000000001';
  v_sub uuid := '74000000-0000-4000-8000-000000000001';
  v_provider uuid;
  v_payment2 uuid;
  v_payment_failed uuid;
  v_unallocated_payment uuid;
  v_unallocated_allocation uuid;
  v_unallocated_view numeric;
  v_invoice jsonb;
  v_invoice2 jsonb;
  v_invoice_id uuid;
  v_invoice_id2 uuid;
  v_payment uuid;
  v_allocation jsonb;
  v_reversal uuid;
  v_unallocated_reversal uuid;
  v_adjustment uuid;
  v_paid numeric;
  v_status text;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user);
  INSERT INTO public.staynas_organisations(id,slug,name) VALUES(v_org,'cc04-ledger-test','CC04 Ledger Test');
  INSERT INTO public.commercial_accounts(id,organisation_id) VALUES(v_account,v_org);
  INSERT INTO public.commercial_subscriptions(
    id,account_id,plan_code,plan_version,currency,billing_term,property_count,
    price_resolution_ref,accepted_price_snapshot,commercial_acceptance_ref,status,activated_at,
    current_period_starts_at,current_period_ends_at
  ) VALUES (
    v_sub,v_account,'professional',1,'TZS','monthly',1,'cc04-price-ref',
    '{"currency":"TZS","totalAmountMinor":120000,"lines":[{"code":"professional_base","kind":"plan_base","description":"Professional subscription","quantity":1,"unitAmountMinor":120000,"amountMinor":120000}]}',
    'cc04-accepted-contract','active',now(),now(),now()+interval '1 month'
  );
  INSERT INTO public.commercial_provider_accounts(
    organisation_id,provider,provider_account_ref,credential_secret_ref,supported_currencies,status
  ) VALUES(v_org,'manual','manual-ledger-test','secret://test/manual','{TZS}','active') RETURNING id INTO v_provider;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  v_invoice := public.commercial_create_invoice_from_subscription(
    v_sub,now(),now()+interval '1 month',now()+interval '14 days',
    'cc04-invoice-idempotency-001',
    '{"treatment":"not_applicable","policyRef":"tax-policy-test-v1","amountMinor":0,"currency":"TZS"}',
    '{"amountMinor":0,"policyRef":"discount-none-v1"}',v_user
  );
  v_invoice_id := (v_invoice->>'invoiceId')::uuid;
  IF v_invoice->>'replayed' <> 'false' THEN RAISE EXCEPTION 'Initial invoice unexpectedly replayed'; END IF;
  IF (public.commercial_create_invoice_from_subscription(
    v_sub,now(),now()+interval '1 month',now()+interval '14 days',
    'cc04-invoice-idempotency-001',
    '{"treatment":"not_applicable","policyRef":"tax-policy-test-v1","amountMinor":0,"currency":"TZS"}',
    '{"amountMinor":0,"policyRef":"discount-none-v1"}',v_user
  )->>'replayed') <> 'true' THEN RAISE EXCEPTION 'Invoice idempotency replay failed'; END IF;

  v_payment := public.commercial_create_payment_attempt(
    v_invoice_id,v_provider,50000,'TZS','cc04-payment-attempt-001',v_user
  );
  v_payment2 := public.commercial_create_payment_attempt(
    v_invoice_id,v_provider,30000,'TZS','cc04-payment-attempt-002',v_user
  );
  v_payment_failed := public.commercial_create_payment_attempt(
    v_invoice_id,v_provider,1000,'TZS','cc04-payment-attempt-failed',v_user
  );
  v_allocation := public.commercial_confirm_and_allocate_payment(
    v_payment,'manual-receipt-001',50000,'TZS','authorized_manual_verification',
    'manual-settlement-001','cc04-allocation-001',now()
  );
  IF v_allocation->>'replayed' <> 'false' THEN RAISE EXCEPTION 'Allocation unexpectedly replayed'; END IF;
  SELECT amount_paid_minor,status INTO v_paid,v_status FROM public.commercial_invoices WHERE id=v_invoice_id;
  IF v_paid <> 50000 OR v_status <> 'partially_paid' THEN
    RAISE EXCEPTION 'Partial payment balance incorrect: %, %',v_paid,v_status;
  END IF;

  v_allocation := public.commercial_confirm_and_allocate_payment(
    v_payment2,'manual-receipt-002',30000,'TZS','authorized_manual_verification',
    'manual-settlement-002','cc04-allocation-002',now()
  );
  v_adjustment := public.commercial_post_invoice_adjustment(
    v_invoice_id,'cc04-credit-note-001','credit_note',10000,'TZS',
    'contractual_credit','approval-cc04-credit-001',v_user
  );
  IF (SELECT outstanding_minor FROM public.commercial_invoice_receivables WHERE id=v_invoice_id) <> 30000 THEN
    RAISE EXCEPTION 'Credit note was not reflected in the receivable balance';
  END IF;
  IF public.commercial_record_payment_failure(
    v_payment_failed,'manual-failed-ref-001','failed','bank_confirmation_failed','cc04-failure-001'
  ) THEN
    RAISE EXCEPTION 'First payment failure was unexpectedly a replay';
  END IF;
  IF NOT public.commercial_record_payment_failure(
    v_payment_failed,'manual-failed-ref-001','failed','bank_confirmation_failed','cc04-failure-001'
  ) THEN
    RAISE EXCEPTION 'Payment failure replay was not idempotent';
  END IF;
  BEGIN
    PERFORM public.commercial_create_payment_attempt(
      v_invoice_id,v_provider,40000,'TZS','cc04-payment-overpay-001',v_user
    );
    RAISE EXCEPTION 'Payment attempt exceeding adjusted outstanding was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Payment attempt exceeding adjusted outstanding was accepted' THEN RAISE; END IF;
  END;

  v_reversal := public.commercial_record_payment_reversal(
    v_payment,'manual-reversal-001',10000,'TZS','verified_refund',
    'cc04-reversal-001',now(),v_user
  );
  SELECT amount_paid_minor,status INTO v_paid,v_status FROM public.commercial_invoices WHERE id=v_invoice_id;
  IF v_paid <> 70000 OR v_status <> 'partially_paid' THEN
    RAISE EXCEPTION 'Reversal balance incorrect: %, %',v_paid,v_status;
  END IF;
  IF (SELECT outstanding_minor FROM public.commercial_invoice_receivables WHERE id=v_invoice_id) <> 40000 THEN
    RAISE EXCEPTION 'Post-reversal receivable balance incorrect';
  END IF;

  v_unallocated_payment := public.commercial_record_unallocated_payment(
    v_account,v_provider,50000,'TZS','cc04-unallocated-payment-001',v_user
  );
  IF public.commercial_confirm_unallocated_payment(
    v_unallocated_payment,'manual-overpayment-001',50000,'TZS',
    'authorized_manual_verification',now()
  ) THEN
    RAISE EXCEPTION 'First unallocated confirmation was unexpectedly a replay';
  END IF;
  v_unallocated_allocation := public.commercial_allocate_unallocated_payment(
    v_unallocated_payment,v_invoice_id,40000,'manual-overpayment-allocation-001',
    'cc04-unallocated-allocation-001',v_user
  );
  IF public.commercial_allocate_unallocated_payment(
    v_unallocated_payment,v_invoice_id,40000,'manual-overpayment-allocation-001',
    'cc04-unallocated-allocation-001',v_user
  ) <> v_unallocated_allocation THEN
    RAISE EXCEPTION 'Unallocated allocation retry was not idempotent';
  END IF;
  SELECT unallocated_minor INTO v_unallocated_view FROM public.commercial_unallocated_collections
    WHERE payment_id=v_unallocated_payment;
  IF v_unallocated_view <> 10000 THEN
    RAISE EXCEPTION 'Overpayment remainder was not retained as unallocated: %',v_unallocated_view;
  END IF;
  v_unallocated_reversal := public.commercial_record_payment_reversal(
    v_unallocated_payment,'manual-overpayment-refund-001',15000,'TZS',
    'partial_overpayment_refund','cc04-unallocated-reversal-001',now(),v_user
  );
  SELECT amount_paid_minor,status INTO v_paid,v_status FROM public.commercial_invoices WHERE id=v_invoice_id;
  IF v_paid <> 105000 OR v_status <> 'partially_paid' THEN
    RAISE EXCEPTION 'Overpayment reversal did not reverse unallocated first and allocated remainder second: %, %',v_paid,v_status;
  END IF;
  SELECT unallocated_minor INTO v_unallocated_view FROM public.commercial_unallocated_collections
    WHERE payment_id=v_unallocated_payment;
  IF v_unallocated_view <> 0 THEN
    RAISE EXCEPTION 'Overpayment refund did not clear unallocated remainder: %',v_unallocated_view;
  END IF;
  IF public.commercial_record_payment_reversal(
    v_unallocated_payment,'manual-overpayment-refund-001',15000,'TZS',
    'partial_overpayment_refund','cc04-unallocated-reversal-001',now(),v_user
  ) <> v_unallocated_reversal THEN
    RAISE EXCEPTION 'Unallocated payment reversal retry was not idempotent';
  END IF;

  v_allocation := public.commercial_confirm_and_allocate_payment(
    v_payment,'manual-receipt-001',50000,'TZS','authorized_manual_verification',
    'manual-settlement-001','cc04-allocation-001',now()
  );
  IF v_allocation->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'Exact duplicate settlement was not returned as an idempotent replay';
  END IF;
  BEGIN
    PERFORM public.commercial_confirm_and_allocate_payment(
      v_payment,'different-provider-reference',50000,'TZS','authorized_manual_verification',
      'different-settlement-reference','cc04-conflicting-allocation',now()
    );
    RAISE EXCEPTION 'Conflicting duplicate provider callback was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;

  BEGIN
    UPDATE public.commercial_invoices SET total_minor=1 WHERE id=v_invoice_id;
    RAISE EXCEPTION 'Issued invoice snapshot was mutable';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    INSERT INTO public.commercial_invoice_lines(
      invoice_id,line_ref,kind,description,quantity,unit_amount_minor,amount_minor
    ) VALUES(v_invoice_id,'late-line','adjustment','late edit',1,1,1);
    RAISE EXCEPTION 'Issued invoice line was mutable';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  IF NOT EXISTS (SELECT 1 FROM public.commercial_payment_reversals WHERE id=v_reversal) THEN
    RAISE EXCEPTION 'Reversal evidence missing';
  END IF;
  IF public.commercial_record_payment_reversal(
    v_payment,'manual-reversal-001',10000,'TZS','verified_refund',
    'cc04-reversal-001',now(),v_user
  ) <> v_reversal THEN
    RAISE EXCEPTION 'Exact reversal retry was not idempotent';
  END IF;

  v_invoice2 := public.commercial_create_invoice_from_subscription(
    v_sub,now()+interval '1 month',now()+interval '2 months',now()+interval '1 month 14 days',
    'cc04-invoice-void-idempotency',
    '{"treatment":"not_applicable","policyRef":"tax-policy-test-v1","amountMinor":0,"currency":"TZS"}',
    '{"amountMinor":0,"policyRef":"discount-none-v1"}',v_user
  );
  v_invoice_id2 := (v_invoice2->>'invoiceId')::uuid;
  IF NOT public.commercial_void_invoice(v_invoice_id2,'duplicate_invoice','approval-cc04-void-001',v_user) THEN
    RAISE EXCEPTION 'Controlled invoice void was not confirmed';
  END IF;
  IF (SELECT outstanding_minor FROM public.commercial_invoice_receivables WHERE id=v_invoice_id2) <> 0
    OR (SELECT status FROM public.commercial_invoices WHERE id=v_invoice_id2) <> 'void' THEN
    RAISE EXCEPTION 'Voided invoice remains in receivables';
  END IF;

  IF has_table_privilege('authenticated','public.commercial_invoices','SELECT')
    OR has_table_privilege('authenticated','public.commercial_payment_transactions','SELECT')
    OR has_table_privilege('authenticated','public.commercial_payment_allocations','INSERT')
    OR has_table_privilege('authenticated','public.commercial_payment_allocation_reversals','SELECT')
    OR has_table_privilege('service_role','public.commercial_financial_audit_events','DELETE') THEN
    RAISE EXCEPTION 'Financial table grants violate least-privilege policy';
  END IF;

  BEGIN
    PERFORM public.commercial_post_invoice_adjustment(
      v_invoice_id,'cc04-wrong-currency-credit','credit_note',100,'USD',
      'currency_mismatch','approval-cc04-wrong-currency',v_user
    );
    RAISE EXCEPTION 'Cross-currency adjustment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Cross-currency adjustment was accepted' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK;
