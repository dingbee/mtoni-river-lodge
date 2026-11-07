-- CC-03.04 — Transactional subscription administration.
-- Service-role only. Server handlers must resolve founder/tenant identity before
-- invoking this function. This migration does not process payments or grant entitlements.

CREATE OR REPLACE FUNCTION public.commercial_apply_subscription_command(
  _account_id uuid,
  _subscription_id uuid,
  _command text,
  _idempotency_key text,
  _actor_user_id uuid,
  _actor_organisation_id uuid,
  _actor_role text,
  _reason_code text DEFAULT NULL,
  _commercial_acceptance_ref text DEFAULT NULL,
  _period_ends_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_account public.commercial_accounts%ROWTYPE;
  v_subscription public.commercial_subscriptions%ROWTYPE;
  v_event public.commercial_subscription_events%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_next_status text;
  v_metadata jsonb := '{}'::jsonb;
  v_period_end timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Commercial subscription command requires a trusted server principal'
      USING ERRCODE = '42501';
  END IF;

  IF _account_id IS NULL OR _subscription_id IS NULL
    OR _command NOT IN (
      'activate_paid', 'suspend', 'reinstate', 'request_cancellation',
      'cancel_immediately', 'expire', 'renewal_authorized'
    )
    OR _idempotency_key IS NULL OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200
    OR _actor_role NOT IN ('founder_admin', 'tenant_admin', 'service_principal')
    OR (_actor_role <> 'service_principal' AND (_actor_user_id IS NULL OR _actor_organisation_id IS NULL))
    OR (_command IN ('activate_paid', 'suspend', 'reinstate', 'cancel_immediately', 'renewal_authorized')
      AND _actor_role <> 'founder_admin')
    OR (_command = 'expire' AND _actor_role <> 'service_principal')
    OR (_command = 'request_cancellation' AND _actor_role NOT IN ('founder_admin', 'tenant_admin')) THEN
    RAISE EXCEPTION 'Invalid or unauthorized commercial subscription command'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account
  FROM public.commercial_accounts
  WHERE id = _account_id
  FOR UPDATE;

  IF NOT FOUND OR v_account.status <> 'active' THEN
    RAISE EXCEPTION 'Commercial account is missing or inactive'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_event
  FROM public.commercial_subscription_events
  WHERE account_id = _account_id AND idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF v_event.subscription_id <> _subscription_id OR v_event.event_type <> _command THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different command'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'replayed', true, 'accountId', _account_id,
      'subscriptionId', _subscription_id, 'status', (
        SELECT status FROM public.commercial_subscriptions WHERE id = _subscription_id
      ), 'eventId', v_event.id
    );
  END IF;

  SELECT * INTO v_subscription
  FROM public.commercial_subscriptions
  WHERE id = _subscription_id AND account_id = _account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription does not belong to the commercial account'
      USING ERRCODE = 'P0002';
  END IF;

  CASE _command
    WHEN 'activate_paid' THEN
      IF v_subscription.status NOT IN ('pending_activation', 'trialing')
        OR _commercial_acceptance_ref IS NULL
        OR length(btrim(_commercial_acceptance_ref)) NOT BETWEEN 1 AND 300
        OR _period_ends_at IS NULL OR _period_ends_at <= v_now THEN
        RAISE EXCEPTION 'Paid activation requires pending/trialing status, accepted agreement and future period end'
          USING ERRCODE = '22023';
      END IF;
      IF v_subscription.quote_required AND v_subscription.plan_code <> 'enterprise' THEN
        RAISE EXCEPTION 'Quote-required subscription must be Enterprise'
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.commercial_subscriptions
      SET status = 'active',
          activated_at = coalesce(activated_at, v_now),
          commercial_acceptance_ref = _commercial_acceptance_ref,
          current_period_starts_at = v_now,
          current_period_ends_at = _period_ends_at,
          cancel_at_period_end = false,
          cancellation_requested_at = NULL,
          suspended_at = NULL,
          suspension_reason_code = NULL,
          suspended_from_status = NULL,
          ended_at = NULL,
          updated_at = v_now
      WHERE id = _subscription_id
      RETURNING * INTO v_subscription;
      v_metadata := jsonb_build_object(
        'commercialAcceptanceRef', _commercial_acceptance_ref,
        'periodStartsAt', v_subscription.current_period_starts_at,
        'periodEndsAt', v_subscription.current_period_ends_at,
        'priceResolutionRef', v_subscription.price_resolution_ref,
        'currency', v_subscription.currency
      );

    WHEN 'suspend' THEN
      IF v_subscription.status NOT IN ('trialing', 'active')
        OR _reason_code IS NULL OR length(btrim(_reason_code)) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Suspension requires an active/trialing subscription and reason'
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.commercial_subscriptions
      SET status = 'suspended',
          suspended_at = v_now,
          suspension_reason_code = _reason_code,
          suspended_from_status = v_subscription.status,
          updated_at = v_now
      WHERE id = _subscription_id
      RETURNING * INTO v_subscription;
      v_metadata := jsonb_build_object('previousStatus', v_subscription.suspended_from_status);

    WHEN 'reinstate' THEN
      IF v_subscription.status <> 'suspended' OR v_subscription.suspended_from_status IS NULL THEN
        RAISE EXCEPTION 'Only suspended subscriptions can be reinstated'
          USING ERRCODE = '55000';
      END IF;
      v_period_end := CASE
        WHEN v_subscription.suspended_from_status = 'trialing' THEN v_subscription.trial_ends_at
        ELSE v_subscription.current_period_ends_at
      END;
      IF v_period_end IS NULL OR v_period_end <= v_now THEN
        v_next_status := CASE WHEN v_subscription.cancel_at_period_end THEN 'cancelled' ELSE 'expired' END;
        UPDATE public.commercial_subscriptions
        SET status = v_next_status, ended_at = v_now,
            cancel_at_period_end = false,
            suspended_at = NULL, suspension_reason_code = NULL,
            suspended_from_status = NULL, updated_at = v_now
        WHERE id = _subscription_id
        RETURNING * INTO v_subscription;
      ELSE
        v_next_status := v_subscription.suspended_from_status;
        UPDATE public.commercial_subscriptions
        SET status = v_next_status,
            suspended_at = NULL, suspension_reason_code = NULL,
            suspended_from_status = NULL, updated_at = v_now
        WHERE id = _subscription_id
        RETURNING * INTO v_subscription;
      END IF;
      v_metadata := jsonb_build_object('reinstatedStatus', v_subscription.status);

    WHEN 'request_cancellation' THEN
      IF v_subscription.status NOT IN ('trialing', 'active', 'suspended') THEN
        RAISE EXCEPTION 'Subscription cannot be cancelled from its current status'
          USING ERRCODE = '55000';
      END IF;
      v_period_end := CASE
        WHEN v_subscription.status = 'trialing'
          OR (v_subscription.status = 'suspended' AND v_subscription.suspended_from_status = 'trialing')
          THEN v_subscription.trial_ends_at
        ELSE v_subscription.current_period_ends_at
      END;
      IF v_period_end IS NULL THEN
        RAISE EXCEPTION 'Cancellation requires a known trial or paid period boundary'
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.commercial_subscriptions
      SET cancel_at_period_end = true,
          cancellation_requested_at = v_now,
          updated_at = v_now
      WHERE id = _subscription_id
      RETURNING * INTO v_subscription;
      v_metadata := jsonb_build_object('effectiveAt', v_period_end);

    WHEN 'cancel_immediately' THEN
      IF v_subscription.status IN ('cancelled', 'expired')
        OR _reason_code IS NULL OR length(btrim(_reason_code)) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Immediate cancellation requires a non-terminal subscription and reason'
          USING ERRCODE = '55000';
      END IF;
      UPDATE public.commercial_subscriptions
      SET status = 'cancelled', cancel_at_period_end = false,
          cancellation_requested_at = v_now, ended_at = v_now,
          suspended_at = NULL, suspension_reason_code = NULL,
          suspended_from_status = NULL, updated_at = v_now
      WHERE id = _subscription_id
      RETURNING * INTO v_subscription;
      v_metadata := jsonb_build_object('reasonCode', _reason_code);

    WHEN 'expire' THEN
      v_period_end := CASE WHEN v_subscription.status = 'trialing'
        THEN v_subscription.trial_ends_at ELSE v_subscription.current_period_ends_at END;
      IF v_subscription.status NOT IN ('trialing', 'active')
        OR v_period_end IS NULL OR v_period_end > v_now THEN
        RAISE EXCEPTION 'Subscription is not eligible to expire'
          USING ERRCODE = '55000';
      END IF;
      v_next_status := CASE WHEN v_subscription.cancel_at_period_end THEN 'cancelled' ELSE 'expired' END;
      UPDATE public.commercial_subscriptions
      SET status = v_next_status, ended_at = v_now,
          cancel_at_period_end = false, updated_at = v_now
      WHERE id = _subscription_id
      RETURNING * INTO v_subscription;
      v_metadata := jsonb_build_object('periodEndedAt', v_period_end);

    WHEN 'renewal_authorized' THEN
      IF v_subscription.status <> 'active'
        OR v_subscription.current_period_ends_at IS NULL
        OR _commercial_acceptance_ref IS NULL
        OR length(btrim(_commercial_acceptance_ref)) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'Renewal authorization requires an active subscription and accepted renewal reference'
          USING ERRCODE = '22023';
      END IF;
      -- Authorization is evidence only. CC-04 payment/collection and successful
      -- settlement are required before any paid-period extension is recorded.
      v_metadata := jsonb_build_object(
        'currentPeriodEndsAt', v_subscription.current_period_ends_at,
        'renewalAcceptanceRef', _commercial_acceptance_ref,
        'paymentRequired', true,
        'periodExtended', false
      );
  END CASE;

  INSERT INTO public.commercial_subscription_events(
    account_id, subscription_id, event_type, occurred_at, idempotency_key,
    actor_user_id, actor_organisation_id, actor_role, reason_code, event_metadata
  ) VALUES (
    _account_id, _subscription_id, _command, v_now, _idempotency_key,
    _actor_user_id, _actor_organisation_id, _actor_role, _reason_code, v_metadata
  ) RETURNING * INTO v_event;

  INSERT INTO public.commercial_audit_events(
    request_id, actor_user_id, actor_organisation_id, actor_role,
    action, resource_type, resource_ref, outcome, reason_code, occurred_at, metadata
  ) VALUES (
    _idempotency_key, _actor_user_id, _actor_organisation_id, _actor_role,
    'subscription.' || _command, 'subscription', _subscription_id::text,
    'succeeded', _reason_code, v_now, v_metadata
  );

  RETURN jsonb_build_object(
    'ok', true, 'replayed', false, 'accountId', _account_id,
    'subscriptionId', _subscription_id, 'status', v_subscription.status,
    'eventId', v_event.id, 'metadata', v_metadata
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commercial_apply_subscription_command(
  uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_apply_subscription_command(
  uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.commercial_apply_subscription_command(
  uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz
) IS 'Service-role-only transactional subscription lifecycle command. Server handlers enforce verified actor authority; no payment or entitlement side effects.';
