-- DC-04.7 — server-only Vault credential resolution.
-- ARTIFACT ONLY: do not apply to the shared/production Supabase project.
-- The only callable database role is service_role; app-layer authorization must
-- already have produced the immutable AdapterExecutionContext.

BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_resolve_distribution_credential(
  _connection_id uuid,
  _organisation_id uuid,
  _property_id uuid,
  _provider_key text,
  _external_account_reference text,
  _environment text,
  _capability text,
  _correlation_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _resolved_secret text;
  _grant_id uuid;
BEGIN
  -- EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to service_role below.
  -- PostgreSQL enforces that privilege before entering this SECURITY DEFINER function.

  IF _connection_id IS NULL
    OR _organisation_id IS NULL
    OR _property_id IS NULL
    OR _provider_key IS NULL
    OR _external_account_reference IS NULL
    OR _environment IS NULL
    OR _environment NOT IN ('sandbox','live')
    OR _capability IS NULL
    OR _correlation_id IS NULL
    OR length(trim(_correlation_id)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'Invalid credential resolution context.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    vs.decrypted_secret,
    g.id
  INTO
    _resolved_secret,
    _grant_id
  FROM public.staynas_distribution_connections AS c
  JOIN public.staynas_distribution_account_grants AS g
    ON g.id = c.account_grant_id
   AND g.organisation_id = c.organisation_id
   AND g.property_id = c.property_id
   AND g.external_account_id = c.external_account_id
   AND g.provider_key = c.provider_key
   AND g.environment = c.environment
  JOIN public.staynas_distribution_external_accounts AS a
    ON a.id = c.external_account_id
   AND a.organisation_id = c.organisation_id
   AND a.provider_key = c.provider_key
   AND a.environment = c.environment
  JOIN vault.decrypted_secrets AS vs
    ON vs.id = a.credential_reference::uuid
  WHERE c.id = _connection_id
    AND c.organisation_id = _organisation_id
    AND c.property_id = _property_id
    AND c.provider_key = _provider_key
    AND c.environment = _environment
    AND a.external_account_reference = _external_account_reference
    AND c.lifecycle = 'connected'
    AND g.grant_status = 'active'
    AND g.granted_capabilities @> ARRAY[_capability]::text[]
    AND a.lifecycle = 'connected'
  LIMIT 1;

  IF _resolved_secret IS NULL OR length(_resolved_secret) = 0 OR _grant_id IS NULL THEN
    RAISE EXCEPTION 'Credential unavailable for the authorized distribution connection.'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.staynas_distribution_audit_events (
    organisation_id,
    property_id,
    account_grant_id,
    connection_id,
    event_type,
    actor_type,
    actor_user_id,
    reason,
    correlation_id
  ) VALUES (
    _organisation_id,
    _property_id,
    _grant_id,
    _connection_id,
    'credential.accessed',
    'system',
    NULL,
    'Credential resolved for an authorized adapter execution.',
    _correlation_id
  );

  RETURN _resolved_secret;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_resolve_distribution_credential(
  uuid, uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_resolve_distribution_credential(
  uuid, uuid, uuid, text, text, text, text, text
) TO service_role;

COMMIT;
