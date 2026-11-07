-- CC-03.03 atomic trial activation tests.
-- Runs after CC03.01/02 schema and CC03.03 activation function migrations.
BEGIN;

DO $test$
DECLARE
  v_org uuid := '61000000-0000-4000-8000-000000000001';
  v_account uuid := '62000000-0000-4000-8000-000000000001';
  v_subscription uuid := '63000000-0000-4000-8000-000000000001';
  v_second_subscription uuid := '63000000-0000-4000-8000-000000000002';
  v_result jsonb;
  v_replay jsonb;
  v_started timestamptz;
  v_ends timestamptz;
  v_event_count integer;
  v_audit_count integer;
  v_claim_count integer;
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.commercial_activate_trial(uuid,uuid,text,integer,integer,text,uuid,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.commercial_activate_trial(uuid,uuid,text,integer,integer,text,uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Trial activation function is not service-role-only';
  END IF;

  INSERT INTO public.staynas_organisations(id, slug, name) VALUES (v_org, 'cc03-trial-test-org', 'CC03 Trial Test Organisation');
  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account, v_org);
  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot
  ) VALUES (
    v_subscription, v_account, 'professional', 2, 'TZS', 'monthly',
    1, 'trial-activation-price-v2', '{"currency":"TZS","total":100000}'
  );

  -- Direct authenticated callers cannot invoke the privileged transaction.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.commercial_activate_trial(
      v_account, v_subscription, 'professional', 2, 3,
      'cc03-unauthorized-0001', NULL, NULL, 'tenant_admin'
    );
    RAISE EXCEPTION 'Authenticated client unexpectedly invoked trial activation';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  -- Trusted server invocation atomically updates subscription, trial claim,
  -- lifecycle event and commercial audit evidence.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.commercial_activate_trial(
    v_account, v_subscription, 'professional', 2, 3,
    'cc03-trial-activate-0001', NULL, NULL, 'service_principal'
  );

  IF v_result->>'ok' <> 'true'
    OR v_result->>'replayed' <> 'false'
    OR v_result->>'status' <> 'trialing'
    OR (v_result->>'policyVersion')::integer <> 3 THEN
    RAISE EXCEPTION 'Initial trial activation returned an invalid result: %', v_result;
  END IF;

  v_started := (v_result->>'trialStartedAt')::timestamptz;
  v_ends := (v_result->>'trialEndsAt')::timestamptz;
  IF v_ends - v_started <> interval '336 hours' THEN
    RAISE EXCEPTION 'Trial window is not exactly 336 hours';
  END IF;

  SELECT count(*) INTO v_claim_count
  FROM public.commercial_trial_claims WHERE account_id = v_account;
  SELECT count(*) INTO v_event_count
  FROM public.commercial_subscription_events
  WHERE account_id = v_account AND idempotency_key = 'cc03-trial-activate-0001';
  SELECT count(*) INTO v_audit_count
  FROM public.commercial_audit_events
  WHERE request_id = 'cc03-trial-activate-0001';

  IF v_claim_count <> 1 OR v_event_count <> 1 OR v_audit_count <> 1 THEN
    RAISE EXCEPTION 'Trial activation did not create exactly one claim, event and audit record';
  END IF;

  -- Exact replay returns the original activation window and creates no new rows.
  v_replay := public.commercial_activate_trial(
    v_account, v_subscription, 'professional', 2, 3,
    'cc03-trial-activate-0001', NULL, NULL, 'service_principal'
  );
  IF v_replay->>'replayed' <> 'true'
    OR v_replay->>'eventId' <> v_result->>'eventId'
    OR v_replay->>'trialStartedAt' <> v_result->>'trialStartedAt'
    OR v_replay->>'trialEndsAt' <> v_result->>'trialEndsAt' THEN
    RAISE EXCEPTION 'Idempotent replay did not return the original activation result';
  END IF;

  -- Reusing the key with a different policy is a conflict.
  BEGIN
    PERFORM public.commercial_activate_trial(
      v_account, v_subscription, 'professional', 2, 4,
      'cc03-trial-activate-0001', NULL, NULL, 'service_principal'
    );
    RAISE EXCEPTION 'Mismatched idempotency replay unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  -- A second key cannot grant another trial to the same account.
  BEGIN
    PERFORM public.commercial_activate_trial(
      v_account, v_subscription, 'professional', 2, 3,
      'cc03-trial-activate-0002', NULL, NULL, 'service_principal'
    );
    RAISE EXCEPTION 'Second trial activation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  -- Even after the first subscription expires, the account's claim remains.
  UPDATE public.commercial_subscriptions
  SET status = 'expired', ended_at = v_ends
  WHERE id = v_subscription;

  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot
  ) VALUES (
    v_second_subscription, v_account, 'professional', 2, 'TZS', 'monthly',
    1, 'trial-activation-price-v2', '{"currency":"TZS","total":100000}'
  );

  BEGIN
    PERFORM public.commercial_activate_trial(
      v_account, v_second_subscription, 'professional', 2, 3,
      'cc03-trial-activate-0003', NULL, NULL, 'service_principal'
    );
    RAISE EXCEPTION 'Expired account unexpectedly reclaimed a trial';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  SET CONSTRAINTS commercial_subscription_trial_claim_required IMMEDIATE;
END;
$test$;

ROLLBACK;
