-- DC-07B — durable credential rotation and connection lifecycle controls.
-- Service-role RPCs are called only by authenticated server functions that also verify membership.
-- Each RPC independently checks selected-property owner/manager authority and commits state + audit atomically.

BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_rotate_distribution_credential(
  _connection_id uuid,
  _organisation_id uuid,
  _property_id uuid,
  _actor_user_id uuid,
  _credential_secret text,
  _correlation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _credential_reference uuid;
  _grant_id uuid;
  _provider_key text;
  _environment text;
  _connection_state text;
BEGIN
  IF _connection_id IS NULL OR _organisation_id IS NULL OR _property_id IS NULL
     OR _actor_user_id IS NULL OR _credential_secret IS NULL
     OR length(trim(_credential_secret)) NOT BETWEEN 1 AND 65536
     OR _correlation_id IS NULL OR length(trim(_correlation_id)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'Invalid distribution credential rotation input.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_user_property_context pc
    JOIN public.staynas_property_members pm
      ON pm.property_id=pc.property_id AND pm.user_id=pc.user_id
    JOIN public.staynas_properties p ON p.id=pc.property_id
    JOIN public.staynas_organisations o ON o.id=p.organisation_id
    WHERE pc.user_id=_actor_user_id AND pc.property_id=_property_id
      AND p.organisation_id=_organisation_id AND p.status='active' AND o.status='active'
      AND pm.status='active' AND pm.role::text IN ('owner','manager','admin')
  ) THEN
    RAISE EXCEPTION 'Active selected-property manager membership is required.' USING ERRCODE='42501';
  END IF;

  SELECT a.credential_reference,g.id,c.provider_key,c.environment,c.lifecycle
  INTO _credential_reference,_grant_id,_provider_key,_environment,_connection_state
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key AND g.environment=c.environment
  JOIN public.staynas_distribution_external_accounts a
    ON a.id=c.external_account_id AND a.organisation_id=c.organisation_id
   AND a.provider_key=c.provider_key AND a.environment=c.environment
  WHERE c.id=_connection_id AND c.organisation_id=_organisation_id
    AND c.property_id=_property_id AND c.environment='sandbox'
    AND c.lifecycle IN ('pending_validation','connected','degraded','error')
    AND g.grant_status='active'
  FOR UPDATE OF c,g,a;

  IF _credential_reference IS NULL OR _grant_id IS NULL OR _provider_key IS NULL
     OR _environment IS DISTINCT FROM 'sandbox'
  THEN
    RAISE EXCEPTION 'An active, non-revoked sandbox connection is required for credential rotation.' USING ERRCODE='42501';
  END IF;

  PERFORM vault.update_secret(
    _credential_reference,
    _credential_secret,
    NULL,
    'StayNas rotated provider credential. Provider=' || _provider_key || '; environment=sandbox.',
    NULL
  );

  UPDATE public.staynas_distribution_external_accounts
  SET lifecycle='pending_validation',updated_by=_actor_user_id,updated_at=now()
  WHERE credential_reference=_credential_reference;

  UPDATE public.staynas_distribution_connections
  SET lifecycle='pending_validation',updated_by=_actor_user_id,updated_at=now()
  WHERE id=_connection_id;

  INSERT INTO public.staynas_distribution_audit_events (
    organisation_id,property_id,account_grant_id,connection_id,event_type,
    from_state,to_state,actor_type,actor_user_id,reason,correlation_id
  ) VALUES (
    _organisation_id,_property_id,_grant_id,_connection_id,'credential.rotated',
    _connection_state,'pending_validation','user',_actor_user_id,
    'Provider credential rotated in Vault; sandbox revalidation required.',_correlation_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_rotate_distribution_credential(uuid,uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_rotate_distribution_credential(uuid,uuid,uuid,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_transition_distribution_connection(
  _connection_id uuid,
  _organisation_id uuid,
  _property_id uuid,
  _actor_user_id uuid,
  _action text,
  _reason text,
  _correlation_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _grant_id uuid;
  _external_account_id uuid;
  _from_state text;
  _to_state text;
BEGIN
  IF _connection_id IS NULL OR _organisation_id IS NULL OR _property_id IS NULL
     OR _actor_user_id IS NULL OR _action IS NULL OR _action NOT IN ('suspend','resume','revoke')
     OR _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 1 AND 1000
     OR _correlation_id IS NULL OR length(trim(_correlation_id)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'Invalid distribution lifecycle transition input.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_user_property_context pc
    JOIN public.staynas_property_members pm
      ON pm.property_id=pc.property_id AND pm.user_id=pc.user_id
    JOIN public.staynas_properties p ON p.id=pc.property_id
    JOIN public.staynas_organisations o ON o.id=p.organisation_id
    WHERE pc.user_id=_actor_user_id AND pc.property_id=_property_id
      AND p.organisation_id=_organisation_id AND p.status='active' AND o.status='active'
      AND pm.status='active' AND pm.role::text IN ('owner','manager','admin')
  ) THEN
    RAISE EXCEPTION 'Active selected-property manager membership is required.' USING ERRCODE='42501';
  END IF;

  SELECT c.account_grant_id,c.external_account_id,c.lifecycle
  INTO _grant_id,_external_account_id,_from_state
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key AND g.environment=c.environment
  WHERE c.id=_connection_id AND c.organisation_id=_organisation_id
    AND c.property_id=_property_id AND c.environment='sandbox'
  FOR UPDATE OF c,g;

  IF _grant_id IS NULL OR _external_account_id IS NULL THEN
    RAISE EXCEPTION 'Distribution connection was not found in the selected property.' USING ERRCODE='P0002';
  END IF;

  IF _action='suspend' THEN
    IF _from_state NOT IN ('pending_validation','connected','degraded','error') THEN
      RAISE EXCEPTION 'Only an active or recoverable connection can be suspended.' USING ERRCODE='55000';
    END IF;
    _to_state := 'suspended';
  ELSIF _action='resume' THEN
    IF _from_state <> 'suspended' OR NOT EXISTS (
      SELECT 1 FROM public.staynas_distribution_account_grants
      WHERE id=_grant_id AND grant_status='active'
    ) THEN
      RAISE EXCEPTION 'Only a suspended connection with an active grant can be resumed.' USING ERRCODE='55000';
    END IF;
    _to_state := 'pending_validation';
  ELSE
    IF _from_state='revoked' THEN
      RAISE EXCEPTION 'A revoked connection is terminal and cannot be changed.' USING ERRCODE='55000';
    END IF;
    _to_state := 'revoked';
  END IF;

  UPDATE public.staynas_distribution_connections
  SET lifecycle=_to_state,updated_by=_actor_user_id,updated_at=now()
  WHERE id=_connection_id;

  UPDATE public.staynas_distribution_external_accounts
  SET lifecycle=_to_state,updated_by=_actor_user_id,updated_at=now()
  WHERE id=_external_account_id;

  IF _action='revoke' THEN
    UPDATE public.staynas_distribution_account_grants
    SET grant_status='revoked',revoked_by=_actor_user_id,revoked_at=now(),
        revocation_reason=trim(_reason),updated_at=now()
    WHERE id=_grant_id AND grant_status='active';
    INSERT INTO public.staynas_distribution_audit_events (
      organisation_id,property_id,account_grant_id,connection_id,event_type,
      from_state,to_state,actor_type,actor_user_id,reason,correlation_id
    ) VALUES (
      _organisation_id,_property_id,_grant_id,_connection_id,'account_grant.revoked',
      _from_state,'revoked','user',_actor_user_id,trim(_reason),_correlation_id
    );
  ELSE
    INSERT INTO public.staynas_distribution_audit_events (
      organisation_id,property_id,account_grant_id,connection_id,event_type,
      from_state,to_state,actor_type,actor_user_id,reason,correlation_id
    ) VALUES (
      _organisation_id,_property_id,_grant_id,_connection_id,'connection.lifecycle_changed',
      _from_state,_to_state,'user',_actor_user_id,trim(_reason),_correlation_id
    );
  END IF;

  RETURN _to_state;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_transition_distribution_connection(uuid,uuid,uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_transition_distribution_connection(uuid,uuid,uuid,uuid,text,text,text)
  TO service_role;

COMMIT;
