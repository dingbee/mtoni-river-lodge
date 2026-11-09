-- CC-05: durable, tenant-scoped runtime entitlement assignments and decisions.
-- Founder-authored grant rules are explicit; no plan matrices or quotas are seeded.

CREATE TABLE IF NOT EXISTS public.commercial_entitlement_grant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_type text NOT NULL CHECK (grant_type IN ('addon_feature','custom_feature','override','platform_restriction')),
  organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  addon_code text,
  feature_code text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('granted','suspended','review')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (
    (grant_type = 'addon_feature' AND addon_code IS NOT NULL AND organisation_id IS NULL AND effect = 'granted')
    OR (grant_type = 'custom_feature' AND addon_code IS NULL AND organisation_id IS NOT NULL AND effect = 'granted')
    OR (grant_type = 'override' AND addon_code IS NULL AND organisation_id IS NOT NULL AND effect IN ('granted','suspended'))
    OR (grant_type = 'platform_restriction' AND addon_code IS NULL AND effect IN ('suspended','review'))
  )
);
CREATE INDEX IF NOT EXISTS commercial_entitlement_rules_lookup_idx
  ON public.commercial_entitlement_grant_rules(grant_type, organisation_id, feature_code, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS commercial_entitlement_rules_addon_idx
  ON public.commercial_entitlement_grant_rules(addon_code, feature_code, effective_from, effective_to)
  WHERE grant_type = 'addon_feature';

CREATE TABLE IF NOT EXISTS public.commercial_entitlement_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  feature_code text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('plan','addon','custom','override')),
  source_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (subscription_id, account_id)
    REFERENCES public.commercial_subscriptions(id, account_id) ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (subscription_id, feature_code)
);
CREATE INDEX IF NOT EXISTS commercial_entitlement_assignments_tenant_idx
  ON public.commercial_entitlement_assignments(organisation_id, feature_code, status);

CREATE TABLE IF NOT EXISTS public.commercial_entitlement_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  feature_code text NOT NULL,
  allowed boolean NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (
    'granted','not_included_in_plan','addon_required','subscription_inactive',
    'subscription_expired','trial_expired','property_limit_reached',
    'usage_limit_reached','temporarily_suspended','commercial_review_required'
  )),
  source_type text CHECK (source_type IS NULL OR source_type IN ('plan','addon','custom','override')),
  source_ref text,
  reason text NOT NULL,
  policy_version_id uuid REFERENCES public.commercial_policy_config_versions(id) ON DELETE RESTRICT,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (subscription_id, account_id)
    REFERENCES public.commercial_subscriptions(id, account_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS commercial_entitlement_decisions_tenant_time_idx
  ON public.commercial_entitlement_decisions(organisation_id, decided_at DESC);

DO $block$
DECLARE v_table regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.commercial_entitlement_grant_rules'::regclass,
    'public.commercial_entitlement_assignments'::regclass,
    'public.commercial_entitlement_decisions'::regclass
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', v_table);
  END LOOP;
END;
$block$;

REVOKE ALL ON TABLE
  public.commercial_entitlement_grant_rules,
  public.commercial_entitlement_assignments,
  public.commercial_entitlement_decisions
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_entitlement_grant_rules TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_entitlement_assignments TO service_role;
GRANT SELECT, INSERT ON TABLE public.commercial_entitlement_decisions TO service_role;

CREATE OR REPLACE FUNCTION public.reject_entitlement_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Commercial entitlement grant rules and decisions are append-only'
    USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_entitlement_history_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER commercial_entitlement_rules_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_entitlement_grant_rules
  FOR EACH ROW EXECUTE FUNCTION public.reject_entitlement_history_mutation();
CREATE TRIGGER commercial_entitlement_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_entitlement_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_entitlement_history_mutation();

CREATE OR REPLACE FUNCTION public.commercial_record_entitlement_grant(
  _grant_type text,
  _organisation_id uuid,
  _addon_code text,
  _feature_code text,
  _effect text,
  _effective_from timestamptz,
  _effective_to timestamptz,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.commercial_is_founder_admin(v_actor) THEN
    RAISE EXCEPTION 'Founder administrator authority is required' USING ERRCODE = '42501';
  END IF;
  IF _grant_type NOT IN ('addon_feature','custom_feature','override','platform_restriction')
    OR _feature_code IS NULL OR length(btrim(_feature_code)) NOT BETWEEN 2 AND 60
    OR _effect NOT IN ('granted','suspended','review')
    OR _effective_from IS NULL OR (_effective_to IS NOT NULL AND _effective_to <= _effective_from)
    OR _reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Invalid entitlement grant rule' USING ERRCODE = '22023';
  END IF;
  IF (_grant_type = 'addon_feature' AND (_addon_code IS NULL OR _organisation_id IS NOT NULL OR _effect <> 'granted'))
    OR (_grant_type = 'custom_feature' AND (_addon_code IS NOT NULL OR _organisation_id IS NULL OR _effect <> 'granted'))
    OR (_grant_type = 'override' AND (_addon_code IS NOT NULL OR _organisation_id IS NULL OR _effect NOT IN ('granted','suspended')))
    OR (_grant_type = 'platform_restriction' AND (_addon_code IS NOT NULL OR _effect NOT IN ('suspended','review'))) THEN
    RAISE EXCEPTION 'Entitlement grant scope does not match grant type' USING ERRCODE = '22023';
  END IF;
  IF _organisation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_organisations WHERE id = _organisation_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active organisation not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.commercial_entitlement_grant_rules(
    grant_type, organisation_id, addon_code, feature_code, effect,
    effective_from, effective_to, reason, created_by
  ) VALUES (
    _grant_type, _organisation_id, _addon_code, _feature_code, _effect,
    _effective_from, _effective_to, btrim(_reason), v_actor
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_record_entitlement_grant(text,uuid,text,text,text,timestamptz,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_record_entitlement_grant(text,uuid,text,text,text,timestamptz,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_record_entitlement_decision(
  _organisation_id uuid,
  _subscription_id uuid,
  _feature_code text,
  _allowed boolean,
  _outcome text,
  _source_type text,
  _source_ref text,
  _reason text,
  _policy_version_id uuid,
  _context_snapshot jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text := current_setting('request.jwt.claim.role', true);
  v_account_id uuid; v_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF _organisation_id IS NULL OR _subscription_id IS NULL
    OR _feature_code IS NULL OR length(btrim(_feature_code)) NOT BETWEEN 2 AND 60
    OR _outcome NOT IN ('granted','not_included_in_plan','addon_required','subscription_inactive',
      'subscription_expired','trial_expired','property_limit_reached','usage_limit_reached',
      'temporarily_suspended','commercial_review_required')
    OR (_source_type IS NOT NULL AND _source_type NOT IN ('plan','addon','custom','override'))
    OR (_allowed IS DISTINCT FROM (_outcome = 'granted'))
    OR _reason IS NULL OR jsonb_typeof(coalesce(_context_snapshot,'{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid entitlement decision payload' USING ERRCODE = '22023';
  END IF;
  SELECT a.id INTO v_account_id
  FROM public.commercial_accounts a
  JOIN public.commercial_subscriptions s ON s.account_id = a.id
  WHERE a.organisation_id = _organisation_id AND a.status = 'active'
    AND s.id = _subscription_id;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Subscription is outside the requested organisation' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.commercial_entitlement_decisions(
    organisation_id, account_id, subscription_id, feature_code, allowed,
    outcome, source_type, source_ref, reason, policy_version_id, context_snapshot
  ) VALUES (
    _organisation_id, v_account_id, _subscription_id, _feature_code, _allowed,
    _outcome, _source_type, _source_ref, _reason, _policy_version_id, coalesce(_context_snapshot,'{}'::jsonb)
  ) RETURNING id INTO v_id;

  IF _allowed THEN
    INSERT INTO public.commercial_entitlement_assignments(
      organisation_id, account_id, subscription_id, feature_code, source_type,
      source_ref, status, effective_from, last_verified_at, context_snapshot
    ) VALUES (
      _organisation_id, v_account_id, _subscription_id, _feature_code, _source_type,
      coalesce(_source_ref,'policy'), 'active', now(), now(), coalesce(_context_snapshot,'{}'::jsonb)
    )
    ON CONFLICT (subscription_id, feature_code) DO UPDATE SET
      source_type = EXCLUDED.source_type,
      source_ref = EXCLUDED.source_ref,
      status = 'active',
      effective_from = EXCLUDED.effective_from,
      effective_to = NULL,
      last_verified_at = now(),
      context_snapshot = EXCLUDED.context_snapshot;
  ELSE
    UPDATE public.commercial_entitlement_assignments
    SET status = 'revoked', effective_to = greatest(now(), effective_from + interval '1 microsecond'), last_verified_at = now(),
        context_snapshot = coalesce(_context_snapshot,'{}'::jsonb)
    WHERE subscription_id = _subscription_id AND feature_code = _feature_code AND status = 'active';
  END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.commercial_record_entitlement_decision(uuid,uuid,text,boolean,text,text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_record_entitlement_decision(uuid,uuid,text,boolean,text,text,text,text,uuid,jsonb) TO service_role;
