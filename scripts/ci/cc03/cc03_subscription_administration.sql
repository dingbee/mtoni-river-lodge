-- Raw PostgreSQL contract script for the CC-03 isolated database workflow.
BEGIN;

DO $test$
DECLARE
  v_org uuid := '61000000-0000-4000-8000-000000000001';
  v_account uuid := '62000000-0000-4000-8000-000000000001';
  v_subscription uuid := '63000000-0000-4000-8000-000000000001';
  v_org2 uuid := '61000000-0000-4000-8000-000000000002';
  v_account2 uuid := '62000000-0000-4000-8000-000000000002';
  v_pending uuid := '63000000-0000-4000-8000-000000000002';
  v_org3 uuid := '61000000-0000-4000-8000-000000000003';
  v_account3 uuid := '62000000-0000-4000-8000-000000000003';
  v_expired uuid := '63000000-0000-4000-8000-000000000003';
  v_result jsonb;
  v_status text;
  v_event_count integer;
BEGIN
  INSERT INTO auth.users(id) VALUES
    ('64000000-0000-4000-8000-000000000001'),
    ('64000000-0000-4000-8000-000000000002');
  INSERT INTO public.staynas_organisations(id, slug, name)
  VALUES (v_org, 'cc034-admin-test', 'CC034 Administration Test');
  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account, v_org);

  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot,
    commercial_acceptance_ref, status, activated_at,
    current_period_starts_at, current_period_ends_at
  ) VALUES (
    v_subscription, v_account, 'professional', 1, 'TZS', 'monthly',
    1, 'cc034-test-price-v1', '{"currency":"TZS","total":120000}',
    'accepted-agreement-cc034', 'active', now(),
    now(), now() + interval '30 days'
  );

  INSERT INTO public.staynas_organisations(id, slug, name)
  VALUES (v_org2, 'cc034-admin-test-2', 'CC034 Administration Test 2');
  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account2, v_org2);
  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot
  ) VALUES (
    v_pending, v_account2, 'essential', 1, 'TZS', 'monthly',
    1, 'cc034-pending-price-v1', '{"currency":"TZS","total":50000}'
  );


  INSERT INTO public.staynas_organisations(id, slug, name)
  VALUES (v_org3, 'cc034-admin-test-3', 'CC034 Administration Test 3');
  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account3, v_org3);
  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot,
    commercial_acceptance_ref, status, activated_at,
    current_period_starts_at, current_period_ends_at,
    suspended_at, suspension_reason_code, suspended_from_status
  ) VALUES (
    v_expired, v_account3, 'professional', 1, 'TZS', 'monthly',
    1, 'cc034-expired-price-v1', '{"currency":"TZS","total":120000}',
    'accepted-agreement-expired', 'suspended', now() - interval '60 days',
    now() - interval '60 days', now() - interval '30 days',
    now() - interval '20 days', 'payment_overdue', 'active'
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.commercial_apply_subscription_command(
      v_account, v_subscription, 'suspend', 'cc034-denied-0001',
      '64000000-0000-4000-8000-000000000001', v_org, 'founder_admin',
      'compliance_review', NULL, NULL
    );
    RAISE EXCEPTION 'Non-service database role unexpectedly executed the command RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  BEGIN
    PERFORM public.commercial_apply_subscription_command(
      v_account, v_subscription, 'suspend', 'cc034-tenant-denied',
      '64000000-0000-4000-8000-000000000001', v_org, 'tenant_admin',
      'compliance_review', NULL, NULL
    );
    RAISE EXCEPTION 'Tenant admin unexpectedly suspended a subscription';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_result := public.commercial_apply_subscription_command(
    v_account, v_subscription, 'suspend', 'cc034-suspend-0001',
    '64000000-0000-4000-8000-000000000001', v_org, 'founder_admin',
    'compliance_review', NULL, NULL
  );
  IF v_result->>'status' <> 'suspended' OR v_result->>'replayed' <> 'false' THEN
    RAISE EXCEPTION 'Founder suspension returned an invalid result: %', v_result;
  END IF;

  v_result := public.commercial_apply_subscription_command(
    v_account, v_subscription, 'suspend', 'cc034-suspend-0001',
    '64000000-0000-4000-8000-000000000001', v_org, 'founder_admin',
    'compliance_review', NULL, NULL
  );
  IF v_result->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'Idempotent suspension replay did not return the original result';
  END IF;

  v_result := public.commercial_apply_subscription_command(
    v_account, v_subscription, 'reinstate', 'cc034-reinstate-0001',
    '64000000-0000-4000-8000-000000000001', v_org, 'founder_admin',
    NULL, NULL, NULL
  );
  IF v_result->>'status' <> 'active' THEN
    RAISE EXCEPTION 'Reinstatement did not restore the active status: %', v_result;
  END IF;

  v_result := public.commercial_apply_subscription_command(
    v_account, v_subscription, 'request_cancellation', 'cc034-cancel-request-01',
    '64000000-0000-4000-8000-000000000002', v_org, 'tenant_admin',
    'tenant_cancellation_request', NULL, NULL
  );
  IF v_result->>'status' <> 'active' THEN
    RAISE EXCEPTION 'Tenant cancellation request must preserve current active status: %', v_result;
  END IF;

  SELECT status INTO v_status FROM public.commercial_subscriptions WHERE id = v_subscription;
  IF v_status <> 'active' OR NOT (
    SELECT cancel_at_period_end FROM public.commercial_subscriptions WHERE id = v_subscription
  ) THEN
    RAISE EXCEPTION 'Tenant cancellation request did not schedule end-of-period cancellation';
  END IF;

  v_result := public.commercial_apply_subscription_command(
    v_account2, v_pending, 'activate_paid', 'cc034-paid-activate-01',
    '64000000-0000-4000-8000-000000000001', v_org, 'founder_admin',
    NULL, 'accepted-essential-terms-01', now() + interval '1 month'
  );
  IF v_result->>'status' <> 'active' THEN
    RAISE EXCEPTION 'Paid activation did not activate the pending subscription: %', v_result;
  END IF;

  BEGIN
    PERFORM public.commercial_apply_subscription_command(
      v_account, v_subscription, 'renewal_authorized', 'cc034-renew-tenant',
      '64000000-0000-4000-8000-000000000002', v_org, 'tenant_admin',
      NULL, 'renewal-acceptance', NULL
    );
    RAISE EXCEPTION 'Tenant admin unexpectedly authorized a renewal';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_result := public.commercial_apply_subscription_command(
    v_account, v_subscription, 'renewal_authorized', 'cc034-renew-founder',
    '64000000-0000-4000-8000-000000000001', v_org, 'founder_admin',
    NULL, 'renewal-acceptance-01', NULL
  );
  IF v_result->>'status' <> 'active'
    OR (v_result->'metadata'->>'periodExtended')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Renewal authorization must not extend a paid period before CC-04 settlement';
  END IF;


  v_result := public.commercial_apply_subscription_command(
    v_account3, v_expired, 'expire', 'cc034-expire-suspended-01',
    NULL, NULL, 'service_principal', 'period_elapsed', NULL, NULL
  );
  IF v_result->>'status' <> 'expired' THEN
    RAISE EXCEPTION 'System expiry did not terminate an elapsed suspended subscription: %', v_result;
  END IF;

  SELECT count(*) INTO v_event_count
  FROM public.commercial_subscription_events
  WHERE account_id IN (v_account, v_account2, v_account3);
  IF v_event_count <> 6 THEN
    RAISE EXCEPTION 'Expected six unique lifecycle events, found %', v_event_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_audit_events
    WHERE resource_ref = v_subscription::text
      AND action = 'subscription.renewal_authorized'
      AND outcome = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'Renewal authorization audit evidence is missing';
  END IF;
END;
$test$;
ROLLBACK;
