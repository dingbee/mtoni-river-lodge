-- CC-03.03 — Atomic one-time trial activation.
-- Service-role only: the authenticated application handler must verify the
-- caller, tenant scope and CC-02 trial policy before invoking this function.
-- This function owns the atomic subscription + trial-claim + event + audit write.

CREATE OR REPLACE FUNCTION public.commercial_activate_trial(
  _account_id uuid,
  _subscription_id uuid,
  _plan_code text,
  _plan_version integer,
  _policy_version integer,
  _idempotency_key text,
  _actor_user_id uuid DEFAULT NULL,
  _actor_organisation_id uuid DEFAULT NULL,
  _actor_role text DEFAULT 'service_principal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_account public.commercial_accounts%ROWTYPE;
  v_subscription public.commercial_subscriptions%ROWTYPE;
  v_existing_event public.commercial_subscription_events%ROWTYPE;
  v_started_at timestamptz;
  v_ends_at timestamptz;
  v_metadata jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Commercial trial activation requires a trusted server principal'
      USING ERRCODE = '42501';
  END IF;

  IF _account_id IS NULL
    OR _subscription_id IS NULL
    OR _plan_code NOT IN ('essential', 'professional', 'enterprise')
    OR _plan_version IS NULL OR _plan_version < 1
    OR _policy_version IS NULL OR _policy_version < 1
    OR _idempotency_key IS NULL OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200
    OR _actor_role NOT IN ('founder_admin', 'tenant_admin', 'tenant_staff', 'service_principal') THEN
    RAISE EXCEPTION 'Invalid commercial trial activation request'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_account
  FROM public.commercial_accounts
  WHERE id = _account_id
  FOR UPDATE;

  IF NOT FOUND OR v_account.status <> 'active' THEN
    RAISE EXCEPTION 'Commercial account is missing or inactive'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent replay returns the original activation window. A reused key
  -- with different subscription/policy input is a conflict, not a new trial.
  SELECT * INTO v_existing_event
  FROM public.commercial_subscription_events
  WHERE account_id = _account_id
    AND idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF v_existing_event.event_type <> 'activate_trial'
      OR v_existing_event.subscription_id <> _subscription_id
      OR v_existing_event.event_metadata->>'planCode' <> _plan_code
      OR v_existing_event.event_metadata->>'planVersion' <> _plan_version::text
      OR v_existing_event.event_metadata->>'policyVersion' <> _policy_version::text THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different commercial command'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'replayed', true,
      'accountId', _account_id,
      'subscriptionId', _subscription_id,
      'status', 'trialing',
      'policyVersion', _policy_version,
      'trialStartedAt', v_existing_event.event_metadata->>'trialStartedAt',
      'trialEndsAt', v_existing_event.event_metadata->>'trialEndsAt',
      'eventId', v_existing_event.id
    );
  END IF;

  -- The account lock serializes concurrent first-trial requests. The durable
  -- primary key on commercial_trial_claims remains the final uniqueness guard.
  IF EXISTS (
    SELECT 1 FROM public.commercial_trial_claims
    WHERE account_id = _account_id
  ) THEN
    RAISE EXCEPTION 'This commercial account has already claimed its one-time trial'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_subscription
  FROM public.commercial_subscriptions
  WHERE id = _subscription_id
    AND account_id = _account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commercial subscription does not belong to this account'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_subscription.status <> 'pending_activation' THEN
    RAISE EXCEPTION 'Only a pending subscription can be activated as a trial'
      USING ERRCODE = '55000';
  END IF;

  IF v_subscription.plan_code <> _plan_code
    OR v_subscription.plan_version <> _plan_version THEN
    RAISE EXCEPTION 'Resolved CC-02 trial policy does not match the accepted subscription plan version'
      USING ERRCODE = '22023';
  END IF;

  v_started_at := clock_timestamp();
  v_ends_at := v_started_at + interval '336 hours';
  v_metadata := jsonb_build_object(
    'planCode', _plan_code,
    'planVersion', _plan_version,
    'policyVersion', _policy_version,
    'durationHours', 336,
    'endBoundary', 'exclusive',
    'trialStartedAt', v_started_at,
    'trialEndsAt', v_ends_at
  );

  UPDATE public.commercial_subscriptions
  SET status = 'trialing',
      activated_at = v_started_at,
      trial_policy_version = _policy_version,
      trial_started_at = v_started_at,
      trial_ends_at = v_ends_at,
      updated_at = v_started_at
  WHERE id = _subscription_id
    AND account_id = _account_id
  RETURNING * INTO v_subscription;

  INSERT INTO public.commercial_trial_claims(
    account_id,
    subscription_id,
    policy_version,
    claimed_at,
    trial_started_at,
    trial_ends_at
  ) VALUES (
    _account_id,
    _subscription_id,
    _policy_version,
    v_started_at,
    v_started_at,
    v_ends_at
  );

  INSERT INTO public.commercial_subscription_events(
    account_id,
    subscription_id,
    event_type,
    occurred_at,
    idempotency_key,
    actor_user_id,
    actor_organisation_id,
    actor_role,
    reason_code,
    event_metadata
  ) VALUES (
    _account_id,
    _subscription_id,
    'activate_trial',
    v_started_at,
    _idempotency_key,
    _actor_user_id,
    _actor_organisation_id,
    _actor_role,
    'trial_activation',
    v_metadata
  )
  RETURNING * INTO v_existing_event;

  INSERT INTO public.commercial_audit_events(
    request_id,
    actor_user_id,
    actor_organisation_id,
    actor_role,
    action,
    resource_type,
    resource_ref,
    outcome,
    reason_code,
    occurred_at,
    metadata
  ) VALUES (
    _idempotency_key,
    _actor_user_id,
    _actor_organisation_id,
    _actor_role,
    'subscription.trial_activated',
    'subscription',
    _subscription_id::text,
    'succeeded',
    'trial_activation',
    v_started_at,
    v_metadata
  );

  RETURN jsonb_build_object(
    'ok', true,
    'replayed', false,
    'accountId', _account_id,
    'subscriptionId', _subscription_id,
    'status', 'trialing',
    'policyVersion', _policy_version,
    'trialStartedAt', v_started_at,
    'trialEndsAt', v_ends_at,
    'eventId', v_existing_event.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commercial_activate_trial(
  uuid, uuid, text, integer, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_activate_trial(
  uuid, uuid, text, integer, integer, text, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.commercial_activate_trial(
  uuid, uuid, text, integer, integer, text, uuid, uuid, text
) IS
  'Service-role-only atomic trial activation. Caller must authenticate/authorize and resolve CC-02 policy before invocation.';
