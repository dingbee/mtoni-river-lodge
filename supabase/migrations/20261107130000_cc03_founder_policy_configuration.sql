-- CC-03 follow-on: durable founder-managed global commercial policy versions.
-- Additive only. No founder identity, pricing, catalogue, or trial policy is seeded.
CREATE TABLE IF NOT EXISTS public.commercial_policy_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type text NOT NULL CHECK (policy_type IN ('catalogue', 'pricing', 'composition', 'trial_policy')),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) IN ('object', 'array')),
  effective_from date,
  effective_to date,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_policy_config_version_unique UNIQUE (policy_type, version),
  CONSTRAINT commercial_policy_config_effective_window CHECK (
    effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from
  )
);

COMMENT ON TABLE public.commercial_policy_config_versions IS
  'Append-only, versioned global StayNas commercial policy configuration. Authored only by verified founder administrators. No tenant-level policy overrides.';

-- One current published pointer per policy family. Historical versions remain
-- immutable and auditable; publishing a new version atomically advances pointer.
CREATE TABLE IF NOT EXISTS public.commercial_policy_config_current (
  policy_type text PRIMARY KEY CHECK (policy_type IN ('catalogue', 'pricing', 'composition', 'trial_policy')),
  version_id uuid NOT NULL UNIQUE REFERENCES public.commercial_policy_config_versions(id),
  published_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_policy_config_current ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_policy_config_current FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commercial_policy_config_current TO service_role;

ALTER TABLE public.commercial_policy_config_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_policy_config_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commercial_policy_config_versions TO service_role;

CREATE INDEX IF NOT EXISTS commercial_policy_config_lookup_idx
  ON public.commercial_policy_config_versions (policy_type, status, effective_from, effective_to, version DESC);

CREATE OR REPLACE FUNCTION public.guard_commercial_policy_config_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Commercial policy configuration versions are append-only; create a new version'
    USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_commercial_policy_config_immutable() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS commercial_policy_config_no_update ON public.commercial_policy_config_versions;
CREATE TRIGGER commercial_policy_config_no_update
  BEFORE UPDATE OR DELETE ON public.commercial_policy_config_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_policy_config_immutable();

-- The browser calls this function using its authenticated session. The database
-- derives auth.uid() and independently checks the dedicated founder predicate.
-- Policy write and audit evidence commit atomically.
CREATE OR REPLACE FUNCTION public.commercial_record_policy_config(
  _policy_type text,
  _version integer,
  _status text,
  _payload jsonb,
  _effective_from date DEFAULT NULL,
  _effective_to date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_founder_org uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.commercial_is_founder_admin(v_actor) THEN
    RAISE EXCEPTION 'Founder administrator authority is required'
      USING ERRCODE = '42501';
  END IF;

  IF _policy_type NOT IN ('catalogue', 'pricing', 'composition', 'trial_policy')
    OR _version IS NULL OR _version < 1
    OR _status NOT IN ('draft', 'published')
    OR _payload IS NULL OR jsonb_typeof(_payload) NOT IN ('object', 'array')
    OR (_effective_from IS NOT NULL AND _effective_to IS NOT NULL AND _effective_to < _effective_from) THEN
    RAISE EXCEPTION 'Invalid commercial policy configuration input'
      USING ERRCODE = '22023';
  END IF;

  SELECT founder_organisation_id INTO v_founder_org
  FROM public.commercial_founder_tenant_config
  WHERE singleton = true;

  IF v_founder_org IS NULL THEN
    RAISE EXCEPTION 'Commercial founder tenant configuration is missing'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.commercial_policy_config_versions (
    policy_type, version, status, payload, effective_from, effective_to, created_by
  ) VALUES (
    _policy_type, _version, _status, _payload, _effective_from, _effective_to, v_actor
  ) RETURNING id INTO v_id;

  IF _status = 'published' THEN
    INSERT INTO public.commercial_policy_config_current (
      policy_type, version_id, published_by, published_at
    ) VALUES (_policy_type, v_id, v_actor, now())
    ON CONFLICT (policy_type) DO UPDATE SET
      version_id = EXCLUDED.version_id,
      published_by = EXCLUDED.published_by,
      published_at = EXCLUDED.published_at;
  END IF;

  INSERT INTO public.commercial_audit_events (
    request_id, actor_user_id, actor_organisation_id, actor_role,
    action, resource_type, resource_ref, outcome, reason_code, metadata
  ) VALUES (
    gen_random_uuid()::text, v_actor, v_founder_org, 'founder_admin',
    'commercial_policy_config.created', 'commercial_account', v_id::text,
    'succeeded', NULL,
    jsonb_build_object(
      'policyType', _policy_type,
      'version', _version,
      'status', _status,
      'effectiveFrom', _effective_from,
      'effectiveTo', _effective_to
    )
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commercial_record_policy_config(text, integer, text, jsonb, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_record_policy_config(text, integer, text, jsonb, date, date) TO authenticated;

COMMENT ON FUNCTION public.commercial_record_policy_config(text, integer, text, jsonb, date, date) IS
  'Caller-bound founder-only append operation. Derives auth.uid(), verifies commercial_is_founder_admin, and writes configuration plus audit evidence atomically.';
