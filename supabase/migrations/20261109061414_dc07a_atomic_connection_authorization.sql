-- DC-07A — enforce property membership in database and finalize only after durable health evidence.
-- The setup and activation RPCs are service-role only. No browser role can invoke them.

BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_create_distribution_connection(
  _organisation_id uuid,
  _property_id uuid,
  _provider_key text,
  _environment text,
  _external_account_reference text,
  _credential_secret text,
  _adapter_version text,
  _granted_capabilities text[],
  _actor_user_id uuid,
  _correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _secret_id uuid;
  _external_account_id uuid;
  _grant_id uuid;
  _connection_id uuid;
  _provider public.staynas_distribution_provider_catalogue%ROWTYPE;
  _api_base_url text;
  _api_host text;
BEGIN
  IF _organisation_id IS NULL OR _property_id IS NULL OR _actor_user_id IS NULL
     OR _provider_key IS NULL OR _environment IS DISTINCT FROM 'sandbox'
     OR _external_account_reference IS NULL
     OR length(trim(_external_account_reference)) NOT BETWEEN 1 AND 256
     OR _credential_secret IS NULL OR length(trim(_credential_secret)) NOT BETWEEN 1 AND 65536
     OR _adapter_version IS DISTINCT FROM '1.0.0'
     OR _correlation_id IS NULL OR length(trim(_correlation_id)) NOT BETWEEN 1 AND 128
     OR coalesce(cardinality(_granted_capabilities),0) = 0
  THEN
    RAISE EXCEPTION 'Invalid distribution connection setup input.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _provider
  FROM public.staynas_distribution_provider_catalogue
  WHERE provider_key = _provider_key AND lifecycle = 'active';

  IF NOT FOUND
     OR NOT (_provider.capabilities @> _granted_capabilities)
     OR NOT (_provider.environment_config ? 'sandbox')
     OR NOT ((_provider.environment_config->'sandbox') ? 'apiBaseUrl')
     OR NOT ((_provider.environment_config->'sandbox') ? 'allowedHosts')
     OR jsonb_typeof(_provider.environment_config->'sandbox'->'allowedHosts') <> 'array'
  THEN
    RAISE EXCEPTION 'Provider is not configured for sandbox connection setup.' USING ERRCODE='55000';
  END IF;

  _api_base_url := _provider.environment_config->'sandbox'->>'apiBaseUrl';
  _api_host := lower(substring(_api_base_url from '^https://([^/:?#]+)'));
  IF _api_host IS NULL OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(_provider.environment_config->'sandbox'->'allowedHosts') AS host(value)
    WHERE lower(host.value)=_api_host
  ) THEN
    RAISE EXCEPTION 'Provider sandbox endpoint is not HTTPS or its host is not allowlisted.' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(_granted_capabilities) capability
    WHERE capability <> 'connection.health'
  ) THEN
    RAISE EXCEPTION 'DC-07A only grants connection.health capability.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    JOIN public.staynas_organisations o ON o.id=p.organisation_id
    WHERE p.id=_property_id AND p.organisation_id=_organisation_id
      AND p.status='active' AND o.status='active'
  ) THEN
    RAISE EXCEPTION 'Active property and organisation scope is required.' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_user_property_context pc
    JOIN public.staynas_property_members pm
      ON pm.property_id=pc.property_id AND pm.user_id=pc.user_id
    WHERE pc.user_id=_actor_user_id AND pc.property_id=_property_id
      AND pm.status='active' AND pm.role::text IN ('owner','manager','admin')
  ) THEN
    RAISE EXCEPTION 'Active selected-property manager membership is required.' USING ERRCODE='42501';
  END IF;

  _secret_id := vault.create_secret(
    _credential_secret,
    'staynas-distribution-' || gen_random_uuid()::text,
    'StayNas provider credential. Provider=' || _provider_key || '; environment=sandbox.',
    NULL
  );

  INSERT INTO public.staynas_distribution_external_accounts (
    organisation_id, provider_key, external_account_reference,
    environment, credential_reference, lifecycle, created_by, updated_by
  ) VALUES (
    _organisation_id, _provider_key, trim(_external_account_reference),
    'sandbox', _secret_id, 'pending_validation', _actor_user_id, _actor_user_id
  )
  RETURNING id INTO _external_account_id;

  INSERT INTO public.staynas_distribution_account_grants (
    organisation_id, property_id, external_account_id, provider_key,
    environment, grant_status, granted_capabilities, granted_by
  ) VALUES (
    _organisation_id, _property_id, _external_account_id, _provider_key,
    'sandbox', 'active', _granted_capabilities, _actor_user_id
  )
  RETURNING id INTO _grant_id;

  INSERT INTO public.staynas_distribution_connections (
    organisation_id, property_id, account_grant_id, external_account_id,
    provider_key, adapter_version, environment, lifecycle, created_by, updated_by
  ) VALUES (
    _organisation_id, _property_id, _grant_id, _external_account_id,
    _provider_key, _adapter_version, 'sandbox', 'pending_validation',
    _actor_user_id, _actor_user_id
  )
  RETURNING id INTO _connection_id;

  INSERT INTO public.staynas_distribution_audit_events (
    organisation_id, property_id, account_grant_id, connection_id,
    event_type, to_state, actor_type, actor_user_id, reason, correlation_id
  ) VALUES (
    _organisation_id, _property_id, _grant_id, _connection_id,
    'connection.created', 'pending_validation', 'user', _actor_user_id,
    'Sandbox provider connection and Vault credential provisioned.', _correlation_id
  );

  RETURN _connection_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_create_distribution_connection(
  uuid,uuid,text,text,text,text,text,text[],uuid,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_distribution_connection(
  uuid,uuid,text,text,text,text,text,text[],uuid,text
) TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_finalize_distribution_connection(
  _connection_id uuid,
  _organisation_id uuid,
  _property_id uuid,
  _actor_user_id uuid,
  _correlation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _account_grant_id uuid;
  _external_account_id uuid;
  _from_state text;
  _adapter_version text;
BEGIN
  IF _connection_id IS NULL OR _organisation_id IS NULL OR _property_id IS NULL
     OR _actor_user_id IS NULL OR _correlation_id IS NULL
     OR length(trim(_correlation_id)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'Invalid distribution connection finalization context.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_user_property_context pc
    JOIN public.staynas_property_members pm
      ON pm.property_id=pc.property_id AND pm.user_id=pc.user_id
    WHERE pc.user_id=_actor_user_id AND pc.property_id=_property_id
      AND pm.status='active' AND pm.role::text IN ('owner','manager','admin')
  ) THEN
    RAISE EXCEPTION 'Active selected-property manager membership is required.' USING ERRCODE='42501';
  END IF;

  SELECT c.account_grant_id,c.external_account_id,c.lifecycle,c.adapter_version
  INTO _account_grant_id,_external_account_id,_from_state,_adapter_version
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key AND g.environment=c.environment
  JOIN public.staynas_distribution_external_accounts a
    ON a.id=c.external_account_id AND a.organisation_id=c.organisation_id
   AND a.provider_key=c.provider_key AND a.environment=c.environment
  WHERE c.id=_connection_id AND c.organisation_id=_organisation_id
    AND c.property_id=_property_id AND c.provider_key='channex'
    AND c.environment='sandbox' AND c.lifecycle IN ('pending_validation','connected')
    AND g.grant_status='active' AND g.granted_capabilities @> ARRAY['connection.health']::text[]
    AND a.lifecycle IN ('pending_validation','connected');

  IF _account_grant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_health_checks h
    WHERE h.connection_id=_connection_id AND h.organisation_id=_organisation_id
      AND h.property_id=_property_id AND h.capability='connection.health'
      AND h.health_state='healthy' AND h.correlation_id=_correlation_id
      AND h.adapter_version=_adapter_version
  ) THEN
    RAISE EXCEPTION 'A matching successful sandbox health check is required before activation.' USING ERRCODE='42501';
  END IF;

  UPDATE public.staynas_distribution_external_accounts
  SET lifecycle='connected',updated_by=_actor_user_id,updated_at=now()
  WHERE id=_external_account_id;

  UPDATE public.staynas_distribution_connections
  SET lifecycle='connected',updated_by=_actor_user_id,updated_at=now()
  WHERE id=_connection_id;

  IF _from_state <> 'connected' THEN
    INSERT INTO public.staynas_distribution_audit_events (
      organisation_id,property_id,account_grant_id,connection_id,event_type,
      from_state,to_state,actor_type,actor_user_id,reason,correlation_id
    ) VALUES (
      _organisation_id,_property_id,_account_grant_id,_connection_id,
      'connection.lifecycle_changed',_from_state,'connected','user',_actor_user_id,
      'Channex sandbox health check passed; connection activated.',_correlation_id
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_finalize_distribution_connection(uuid,uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_finalize_distribution_connection(uuid,uuid,uuid,uuid,text)
  TO service_role;

COMMIT;
