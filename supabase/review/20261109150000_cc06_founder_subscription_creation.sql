-- CC-06: create a founder-approved subscription from a CC-02 resolved price snapshot.
-- Lifecycle status remains pending_activation; activation still uses the CC-03 lifecycle service.
CREATE OR REPLACE FUNCTION public.commercial_create_subscription_for_founder(
  _account_id uuid,
  _plan_code text,
  _plan_version integer,
  _currency text,
  _billing_term text,
  _property_count integer,
  _addon_codes text[],
  _price_resolution_ref text,
  _accepted_price_snapshot jsonb,
  _quote_required boolean,
  _idempotency_key text,
  _reason_code text,
  _actor_user_id uuid,
  _actor_organisation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_account public.commercial_accounts%ROWTYPE;
  v_subscription public.commercial_subscriptions%ROWTYPE;
  v_existing public.commercial_subscription_events%ROWTYPE;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Subscription registration requires a trusted server principal' USING ERRCODE='42501';
  END IF;
  IF _actor_user_id IS NULL OR _actor_organisation_id IS NULL
    OR NOT public.commercial_is_founder_admin_service(_actor_user_id)
    OR NOT EXISTS (SELECT 1 FROM public.commercial_founder_tenant_config cfg WHERE cfg.singleton=true AND cfg.founder_organisation_id=_actor_organisation_id)
    OR _account_id IS NULL
    OR _plan_code NOT IN ('essential','professional','enterprise')
    OR _plan_version IS NULL OR _plan_version < 1
    OR _currency NOT IN ('TZS','USD')
    OR _billing_term NOT IN ('monthly','annual')
    OR _property_count IS NULL OR _property_count < 1
    OR _price_resolution_ref IS NULL OR length(btrim(_price_resolution_ref)) NOT BETWEEN 1 AND 200
    OR _idempotency_key IS NULL OR length(btrim(_idempotency_key)) NOT BETWEEN 8 AND 200
    OR _reason_code IS NULL OR length(btrim(_reason_code)) NOT BETWEEN 2 AND 200
    OR _accepted_price_snapshot IS NULL OR jsonb_typeof(_accepted_price_snapshot) <> 'object'
    OR _accepted_price_snapshot->>'currency' IS DISTINCT FROM _currency
    OR coalesce((_accepted_price_snapshot->>'quoteRequired')::boolean,false) IS DISTINCT FROM _quote_required
    OR (_quote_required AND (_plan_code <> 'enterprise' OR _accepted_price_snapshot ? 'total'
      OR (_accepted_price_snapshot ? 'lineItems' AND jsonb_array_length(_accepted_price_snapshot->'lineItems') <> 0)))
    OR (NOT _quote_required AND (NOT (_accepted_price_snapshot ? 'total')
      OR jsonb_typeof(_accepted_price_snapshot->'total') <> 'number'
      OR (_accepted_price_snapshot->>'total')::numeric < 0
      OR jsonb_typeof(_accepted_price_snapshot->'lineItems') <> 'array'
      OR jsonb_array_length(_accepted_price_snapshot->'lineItems') = 0))
    OR (coalesce(array_length(_addon_codes,1),0) <> (SELECT count(DISTINCT code) FROM unnest(coalesce(_addon_codes,ARRAY[]::text[])) AS code)) THEN
    RAISE EXCEPTION 'Founder subscription registration evidence or resolved price snapshot is invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_idempotency_key,0));
  SELECT * INTO v_account FROM public.commercial_accounts WHERE id=_account_id FOR UPDATE;
  IF NOT FOUND OR v_account.status <> 'active' OR v_account.organisation_id=_actor_organisation_id THEN
    RAISE EXCEPTION 'An active commercial account is required' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_existing FROM public.commercial_subscription_events
  WHERE account_id=_account_id AND idempotency_key=_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'replayed',true,'subscriptionId',v_existing.subscription_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_subscriptions
    WHERE account_id=_account_id AND status IN ('pending_activation','trialing','active','suspended')
  ) THEN
    RAISE EXCEPTION 'An existing subscription must be resolved before a new subscription can be assigned' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.commercial_subscriptions(
    account_id,plan_code,plan_version,currency,billing_term,property_count,addon_codes,
    price_resolution_ref,accepted_price_snapshot,quote_required,status,created_by
  ) VALUES (
    _account_id,_plan_code,_plan_version,_currency,_billing_term,_property_count,
    coalesce(_addon_codes,ARRAY[]::text[]),_price_resolution_ref,_accepted_price_snapshot,
    _quote_required,'pending_activation',_actor_user_id
  ) RETURNING * INTO v_subscription;
  INSERT INTO public.commercial_subscription_events(
    account_id,subscription_id,event_type,occurred_at,idempotency_key,actor_user_id,
    actor_organisation_id,actor_role,reason_code,event_metadata
  ) VALUES (
    _account_id,v_subscription.id,'created',now(),_idempotency_key,_actor_user_id,
    _actor_organisation_id,'founder_admin',_reason_code,
    jsonb_build_object('priceResolutionRef',_price_resolution_ref,'quoteRequired',_quote_required,'planCode',_plan_code,'planVersion',_plan_version)
  );
  INSERT INTO public.commercial_audit_events(
    request_id,actor_user_id,actor_organisation_id,actor_role,action,resource_type,resource_ref,
    outcome,reason_code,occurred_at,metadata
  ) VALUES (
    _idempotency_key,_actor_user_id,_actor_organisation_id,'founder_admin',
    'subscription.created','subscription',v_subscription.id::text,'succeeded',_reason_code,now(),
    jsonb_build_object('accountId',_account_id,'planCode',_plan_code,'planVersion',_plan_version,'currency',_currency,'billingTerm',_billing_term,'quoteRequired',_quote_required)
  );
  RETURN jsonb_build_object('ok',true,'replayed',false,'subscriptionId',v_subscription.id,'quoteRequired',_quote_required);
END $$;
REVOKE ALL ON FUNCTION public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid) TO service_role;
