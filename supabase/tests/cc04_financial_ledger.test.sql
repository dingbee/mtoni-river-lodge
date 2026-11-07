-- CC-04 durable financial ledger tests. Run after CC-03 migrations in isolated PostgreSQL 17.
BEGIN;
DO $test$
DECLARE
  v_org uuid := '71000000-0000-4000-8000-000000000001';
  v_user uuid := '72000000-0000-4000-8000-000000000001';
  v_account uuid := '73000000-0000-4000-8000-000000000001';
  v_sub uuid := '74000000-0000-4000-8000-000000000001';
  v_provider uuid;
  v_invoice jsonb;
  v_invoice_id uuid;
  v_payment uuid;
  v_allocation jsonb;
  v_reversal uuid;
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
  v_allocation := public.commercial_confirm_and_allocate_payment(
    v_payment,'manual-receipt-001',50000,'TZS','authorized_manual_verification',
    'manual-settlement-001','cc04-allocation-001',now()
  );
  IF v_allocation->>'replayed' <> 'false' THEN RAISE EXCEPTION 'Allocation unexpectedly replayed'; END IF;
  SELECT amount_paid_minor,status INTO v_paid,v_status FROM public.commercial_invoices WHERE id=v_invoice_id;
  IF v_paid <> 50000 OR v_status <> 'partially_paid' THEN
    RAISE EXCEPTION 'Partial payment balance incorrect: %, %',v_paid,v_status;
  END IF;

  v_reversal := public.commercial_record_payment_reversal(
    v_payment,'manual-reversal-001',10000,'TZS','verified_refund',
    'cc04-reversal-001',now(),v_user
  );
  SELECT amount_paid_minor,status INTO v_paid,v_status FROM public.commercial_invoices WHERE id=v_invoice_id;
  IF v_paid <> 40000 OR v_status <> 'partially_paid' THEN
    RAISE EXCEPTION 'Reversal balance incorrect: %, %',v_paid,v_status;
  END IF;

  BEGIN
    PERFORM public.commercial_confirm_and_allocate_payment(
      v_payment,'manual-receipt-duplicate',50000,'TZS','authorized_manual_verification',
      'manual-settlement-duplicate','cc04-allocation-duplicate',now()
    );
    RAISE EXCEPTION 'Successful payment was allocated twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Successful payment was allocated twice' THEN RAISE; END IF;
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
END;
$test$;
ROLLBACK;
