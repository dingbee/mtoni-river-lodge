-- DC-04.11 — durable, append-only connection and capability health evidence.
-- ARTIFACT ONLY: never apply to shared/UAT/production until the coordinated release gate.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN (
    'listing.read','listing.write','room_mapping.read','room_mapping.write',
    'rate_plan.read','rate_plan.write','availability.read','availability.write',
    'reservation.read','reservation.import','reservation.update','reservation.cancel',
    'connection.health'
  )),
  health_state text NOT NULL CHECK (health_state IN ('healthy','degraded','unavailable','unknown')),
  checked_at timestamptz NOT NULL,
  latency_ms integer CHECK (latency_ms BETWEEN 0 AND 30000),
  normalized_error_code text CHECK (normalized_error_code IS NULL OR normalized_error_code IN (
    'authentication','authorization','configuration','unsupported_capability',
    'rate_limited','timeout','provider_unavailable','invalid_request',
    'conflict','not_found','permanent_provider_error','unknown'
  )),
  safe_message text CHECK (safe_message IS NULL OR length(safe_message) <= 500),
  provider_code text CHECK (provider_code IS NULL OR provider_code ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  adapter_version text NOT NULL CHECK (adapter_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'),
  credential_state text NOT NULL CHECK (credential_state IN ('valid','invalid','unknown','not_checked')),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  worker_id text NOT NULL CHECK (length(trim(worker_id)) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id)
    ON DELETE RESTRICT,
  CHECK (
    (health_state = 'healthy' AND normalized_error_code IS NULL AND safe_message IS NULL)
    OR health_state <> 'healthy'
  )
);

COMMENT ON TABLE public.staynas_distribution_health_checks IS
  'Append-only per-connection/per-capability health evidence. Stores normalized diagnostics only; never provider bodies or secrets.';
CREATE INDEX IF NOT EXISTS staynas_distribution_health_connection_time_idx
  ON public.staynas_distribution_health_checks(connection_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_health_property_capability_time_idx
  ON public.staynas_distribution_health_checks(property_id, capability, checked_at DESC);

ALTER TABLE public.staynas_distribution_health_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_health_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.staynas_distribution_health_checks TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_health_checks FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staynas_reject_distribution_health_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Distribution health evidence is append-only.' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS staynas_distribution_health_append_only
  ON public.staynas_distribution_health_checks;
CREATE TRIGGER staynas_distribution_health_append_only
  BEFORE UPDATE OR DELETE ON public.staynas_distribution_health_checks
  FOR EACH ROW EXECUTE FUNCTION public.staynas_reject_distribution_health_mutation();

CREATE OR REPLACE FUNCTION public.staynas_record_distribution_health_check(
  _organisation_id uuid,
  _property_id uuid,
  _connection_id uuid,
  _capability text,
  _health_state text,
  _checked_at timestamptz,
  _latency_ms integer,
  _normalized_error_code text,
  _safe_message text,
  _provider_code text,
  _adapter_version text,
  _credential_state text,
  _correlation_id text,
  _worker_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _id uuid;
  _role text := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('role', true), '')
  );
BEGIN
  IF _role <> 'service_role' THEN
    RAISE EXCEPTION 'Health evidence writer is restricted to the server role.' USING ERRCODE = '42501';
  END IF;

  IF _organisation_id IS NULL OR _property_id IS NULL OR _connection_id IS NULL
    OR _capability NOT IN (
      'listing.read','listing.write','room_mapping.read','room_mapping.write',
      'rate_plan.read','rate_plan.write','availability.read','availability.write',
      'reservation.read','reservation.import','reservation.update','reservation.cancel',
      'connection.health'
    )
    OR _health_state NOT IN ('healthy','degraded','unavailable','unknown')
    OR _checked_at IS NULL
    OR (_latency_ms IS NOT NULL AND _latency_ms NOT BETWEEN 0 AND 30000)
    OR (_normalized_error_code IS NOT NULL AND _normalized_error_code NOT IN (
      'authentication','authorization','configuration','unsupported_capability',
      'rate_limited','timeout','provider_unavailable','invalid_request',
      'conflict','not_found','permanent_provider_error','unknown'
    ))
    OR (_safe_message IS NOT NULL AND length(_safe_message) > 500)
    OR (_provider_code IS NOT NULL AND _provider_code !~ '^[A-Za-z0-9_.:-]{1,64}$')
    OR _adapter_version IS NULL OR _adapter_version !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'
    OR _credential_state NOT IN ('valid','invalid','unknown','not_checked')
    OR _correlation_id IS NULL OR length(pg_catalog.btrim(_correlation_id)) NOT BETWEEN 1 AND 128
    OR _worker_id IS NULL OR length(pg_catalog.btrim(_worker_id)) NOT BETWEEN 1 AND 128
    OR (_health_state = 'healthy' AND (
      _normalized_error_code IS NOT NULL OR _safe_message IS NOT NULL
    ))
  THEN
    RAISE EXCEPTION 'Invalid distribution health evidence envelope.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staynas_distribution_connections c
    JOIN public.staynas_distribution_account_grants g
      ON g.id = c.account_grant_id
     AND g.organisation_id = c.organisation_id
     AND g.property_id = c.property_id
     AND g.external_account_id = c.external_account_id
     AND g.provider_key = c.provider_key
     AND g.environment = c.environment
    JOIN public.staynas_distribution_external_accounts a
      ON a.id = c.external_account_id
     AND a.organisation_id = c.organisation_id
     AND a.provider_key = c.provider_key
     AND a.environment = c.environment
    WHERE c.id = _connection_id
      AND c.organisation_id = _organisation_id
      AND c.property_id = _property_id
      AND c.adapter_version = _adapter_version
      AND c.lifecycle IN ('connected','degraded','pending_validation')
      AND g.grant_status = 'active'
      AND _capability = ANY(g.granted_capabilities)
      AND a.lifecycle IN ('connected','degraded','pending_validation')
  ) THEN
    RAISE EXCEPTION 'Health evidence scope or active grant was not verified.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.staynas_distribution_health_checks (
    organisation_id,property_id,connection_id,capability,health_state,
    checked_at,latency_ms,normalized_error_code,safe_message,provider_code,
    adapter_version,credential_state,correlation_id,worker_id
  ) VALUES (
    _organisation_id,_property_id,_connection_id,_capability,_health_state,
    _checked_at,_latency_ms,_normalized_error_code,_safe_message,_provider_code,
    _adapter_version,_credential_state,_correlation_id,_worker_id
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_record_distribution_health_check(
  uuid,uuid,uuid,text,text,timestamptz,integer,text,text,text,text,text,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_record_distribution_health_check(
  uuid,uuid,uuid,text,text,timestamptz,integer,text,text,text,text,text,text,text
) TO service_role;

COMMIT;
