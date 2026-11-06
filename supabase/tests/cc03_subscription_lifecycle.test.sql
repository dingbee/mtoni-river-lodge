-- CC-03.02 persistence migration contract tests.
-- Runs after the migration against an isolated PostgreSQL/Supabase-compatible DB.
BEGIN;

DO $test$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'public.commercial_accounts',
    'public.commercial_subscriptions',
    'public.commercial_trial_claims',
    'public.commercial_subscription_events',
    'public.commercial_audit_events',
    'public.commercial_founder_tenant_config',
    'public.commercial_founder_admin_memberships'
  ];
  v_org uuid := '10000000-0000-4000-8000-000000000001';
  v_account uuid := '20000000-0000-4000-8000-000000000001';
  v_subscription uuid := '30000000-0000-4000-8000-000000000001';
  v_event uuid;
  v_user uuid := '40000000-0000-4000-8000-000000000001';
  v_other_user uuid := '40000000-0000-4000-8000-000000000002';
  v_property uuid := '50000000-0000-4000-8000-000000000001';
  v_org2 uuid := '10000000-0000-4000-8000-000000000002';
  v_org3 uuid := '10000000-0000-4000-8000-000000000003';
  v_account2 uuid := '20000000-0000-4000-8000-000000000002';
  v_account3 uuid := '20000000-0000-4000-8000-000000000003';
  v_subscription2 uuid := '30000000-0000-4000-8000-000000000002';
  v_subscription3 uuid := '30000000-0000-4000-8000-000000000003';
  v_audit uuid;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = v_table::regclass
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS/FORCE RLS missing on %', v_table;
    END IF;

    IF has_table_privilege('anon', v_table, 'SELECT')
      OR has_table_privilege('anon', v_table, 'INSERT')
      OR has_table_privilege('authenticated', v_table, 'SELECT')
      OR has_table_privilege('authenticated', v_table, 'INSERT')
      OR has_table_privilege('authenticated', v_table, 'UPDATE')
      OR has_table_privilege('authenticated', v_table, 'DELETE') THEN
      RAISE EXCEPTION 'Client role has direct table privileges on %', v_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.commercial_accounts', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.commercial_subscriptions', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.commercial_trial_claims', 'INSERT')
    OR has_table_privilege('service_role', 'public.commercial_trial_claims', 'UPDATE')
    OR has_table_privilege('service_role', 'public.commercial_trial_claims', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.commercial_subscription_events', 'INSERT')
    OR has_table_privilege('service_role', 'public.commercial_subscription_events', 'UPDATE')
    OR has_table_privilege('service_role', 'public.commercial_subscription_events', 'DELETE')
    OR has_table_privilege('service_role', 'public.commercial_audit_events', 'UPDATE')
    OR has_table_privilege('service_role', 'public.commercial_audit_events', 'DELETE') THEN
    RAISE EXCEPTION 'Service-role grants do not match the least-privilege lifecycle contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'commercial_subscriptions_one_current_per_account'
      AND indexdef ILIKE '%WHERE (status = ANY%'
  ) THEN
    RAISE EXCEPTION 'One-current-subscription partial unique index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commercial_trial_claims'::regclass
      AND conname = 'commercial_trial_claims_pkey'
  ) THEN
    RAISE EXCEPTION 'One-time trial claim primary key is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commercial_subscription_events'::regclass
      AND conname = 'commercial_subscription_events_idempotency_unique'
  ) THEN
    RAISE EXCEPTION 'Subscription event idempotency constraint is missing';
  END IF;

  IF has_function_privilege('anon', 'public.commercial_is_founder_admin(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.commercial_is_founder_admin(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.commercial_user_has_organisation_access(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.commercial_user_has_organisation_access(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Commercial authorization helper grants are not least-privilege';
  END IF;

  IF (SELECT count(*) FROM public.commercial_founder_tenant_config) <> 0
    OR (SELECT count(*) FROM public.commercial_founder_admin_memberships) <> 0 THEN
    RAISE EXCEPTION 'Migration must not seed founder authority or tenant identifiers';
  END IF;

  INSERT INTO auth.users(id) VALUES (v_user), (v_other_user);
  INSERT INTO public.staynas_organisations(id) VALUES (v_org);
  INSERT INTO public.staynas_properties(id, organisation_id, status)
  VALUES (v_property, v_org, 'active');
  INSERT INTO public.staynas_property_members(property_id, user_id, status, role)
  VALUES (v_property, v_user, 'active', 'owner');
  INSERT INTO public.commercial_founder_tenant_config(singleton, founder_organisation_id)
  VALUES (true, v_org);
  INSERT INTO public.commercial_founder_admin_memberships(
    principal_id, organisation_id, status, verified_at
  ) VALUES (v_user, v_org, 'active', now());

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  IF NOT public.commercial_is_founder_admin(v_user) THEN
    RAISE EXCEPTION 'Verified founder principal was not authorized';
  END IF;
  IF NOT public.commercial_user_has_organisation_access(v_org)
    OR public.commercial_user_has_organisation_access(v_org2) THEN
    RAISE EXCEPTION 'Tenant organisation scope predicate returned an incorrect result';
  END IF;
  IF public.commercial_is_founder_admin(v_other_user) THEN
    RAISE EXCEPTION 'Founder helper allowed a cross-user principal probe';
  END IF;
  UPDATE public.commercial_founder_admin_memberships
  SET status = 'revoked' WHERE principal_id = v_user;
  IF public.commercial_is_founder_admin(v_user) THEN
    RAISE EXCEPTION 'Revoked founder principal remained authorized';
  END IF;
  UPDATE public.commercial_founder_admin_memberships
  SET status = 'active' WHERE principal_id = v_user;

  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account, v_org);

  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot
  ) VALUES (
    v_subscription, v_account, 'professional', 1, 'TZS', 'monthly',
    1, 'test-price-resolution-v1', '{"currency":"TZS","total":100000,"lineItems":[{"amount":100000}]}'
  );

  -- Accepted plan/price composition cannot be rewritten after creation.
  BEGIN
    UPDATE public.commercial_subscriptions
    SET accepted_price_snapshot = '{"currency":"TZS","total":1}'
    WHERE id = v_subscription;
    RAISE EXCEPTION 'Accepted price snapshot mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  -- Trial activation is exact, and the durable claim is unique per account.
  UPDATE public.commercial_subscriptions
  SET status = 'trialing',
      activated_at = '2026-11-07T09:00:00Z',
      trial_policy_version = 1,
      trial_started_at = '2026-11-07T09:00:00Z',
      trial_ends_at = '2026-11-21T09:00:00Z'
  WHERE id = v_subscription;

  INSERT INTO public.commercial_trial_claims(
    account_id, subscription_id, policy_version, claimed_at,
    trial_started_at, trial_ends_at
  ) VALUES (
    v_account, v_subscription, 1, '2026-11-07T09:00:00Z',
    '2026-11-07T09:00:00Z', '2026-11-21T09:00:00Z'
  );

  BEGIN
    INSERT INTO public.commercial_trial_claims(
      account_id, subscription_id, policy_version, claimed_at,
      trial_started_at, trial_ends_at
    ) VALUES (
      v_account, v_subscription, 1, '2026-11-07T09:01:00Z',
      '2026-11-07T09:01:00Z', '2026-11-21T09:01:00Z'
    );
    RAISE EXCEPTION 'Second trial claim unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.commercial_trial_claims
    SET trial_ends_at = trial_ends_at + interval '1 day'
    WHERE account_id = v_account;
    RAISE EXCEPTION 'Trial claim mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  -- A second non-terminal subscription cannot be created for the same account.
  BEGIN
    INSERT INTO public.commercial_subscriptions(
      account_id, plan_code, plan_version, currency, billing_term,
      property_count, price_resolution_ref, accepted_price_snapshot
    ) VALUES (
      v_account, 'essential', 1, 'TZS', 'monthly', 1,
      'second-current-subscription',
      '{"currency":"TZS","total":50000}'
    );
    RAISE EXCEPTION 'Second current subscription unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Quote-required Enterprise snapshots cannot invent a total or line items.
  INSERT INTO public.staynas_organisations(id) VALUES (v_org2);
  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account2, v_org2);
  INSERT INTO public.commercial_subscriptions(
    id, account_id, plan_code, plan_version, currency, billing_term,
    property_count, price_resolution_ref, accepted_price_snapshot, quote_required
  ) VALUES (
    v_subscription2, v_account2, 'enterprise', 1, 'USD', 'annual',
    5, 'enterprise-quote-v1', '{"currency":"USD","quoteRequired":true}', true
  );

  INSERT INTO public.staynas_organisations(id) VALUES (v_org3);
  INSERT INTO public.commercial_accounts(id, organisation_id)
  VALUES (v_account3, v_org3);

  -- Paid activation cannot be represented without an explicit acceptance reference.
  BEGIN
    INSERT INTO public.commercial_subscriptions(
      id, account_id, plan_code, plan_version, currency, billing_term,
      property_count, price_resolution_ref, accepted_price_snapshot,
      status, current_period_starts_at, current_period_ends_at
    ) VALUES (
      v_subscription3, v_account3, 'essential', 1, 'TZS', 'monthly',
      1, 'paid-without-acceptance',
      '{"currency":"TZS","total":50000}', 'active',
      '2026-11-07T09:00:00Z', '2026-12-07T09:00:00Z'
    );
    RAISE EXCEPTION 'Paid activation without acceptance unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.commercial_subscriptions(
      id, account_id, plan_code, plan_version, currency, billing_term,
      property_count, price_resolution_ref, accepted_price_snapshot, quote_required
    ) VALUES (
      v_subscription3, v_account3, 'enterprise', 1, 'USD', 'annual',
      5, 'fabricated-enterprise-price',
      '{"currency":"USD","quoteRequired":true,"total":1,"lineItems":[{"amount":1}]}',
      true
    );
    RAISE EXCEPTION 'Fabricated Enterprise quote total unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.commercial_subscription_events(
    account_id, subscription_id, event_type, occurred_at,
    idempotency_key, actor_role, event_metadata
  ) VALUES (
    v_account, v_subscription, 'activate_trial', '2026-11-07T09:00:00Z',
    'test-event-key-0001', 'service_principal', '{}'
  ) RETURNING id INTO v_event;

  BEGIN
    INSERT INTO public.commercial_subscription_events(
      account_id, subscription_id, event_type, occurred_at,
      idempotency_key, actor_role, event_metadata
    ) VALUES (
      v_account, v_subscription, 'activate_trial', '2026-11-07T09:00:01Z',
      'test-event-key-0001', 'service_principal', '{}'
    );
    RAISE EXCEPTION 'Duplicate lifecycle idempotency key unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.commercial_audit_events(
    request_id, actor_role, action, resource_type, resource_ref, outcome, occurred_at
  ) VALUES (
    'cc03-test-audit-request', 'service_principal', 'subscription.trial_activated',
    'subscription', v_subscription::text, 'succeeded', '2026-11-07T09:00:00Z'
  ) RETURNING id INTO v_audit;

  BEGIN
    UPDATE public.commercial_audit_events
    SET reason_code = 'tamper'
    WHERE id = v_audit;
    RAISE EXCEPTION 'Audit event mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    UPDATE public.commercial_subscription_events
    SET reason_code = 'tamper'
    WHERE id = v_event;
    RAISE EXCEPTION 'Lifecycle event mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.commercial_subscriptions WHERE id = v_subscription;
    RAISE EXCEPTION 'Commercial subscription deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.commercial_accounts WHERE id = v_account;
    RAISE EXCEPTION 'Commercial account deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END;
$test$;

ROLLBACK;
