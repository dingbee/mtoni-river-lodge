-- Enforce one selected online guest-payment provider per property.
-- NULL selection disables online checkout; Pay at Property remains available.
CREATE OR REPLACE FUNCTION public.staynas_set_guest_checkout_provider(
  _organisation_id uuid,
  _property_id uuid,
  _provider_config_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _selected uuid;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.staynas_properties
   WHERE id = _property_id AND organisation_id = _organisation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property scope is invalid' USING ERRCODE = '42501';
  END IF;

  IF _provider_config_id IS NOT NULL THEN
    PERFORM 1 FROM public.staynas_guest_payment_provider_accounts
     WHERE id = _provider_config_id
       AND organisation_id = _organisation_id
       AND property_id = _property_id
       AND integration_status = 'ready'
       AND credential_secret_ref IS NOT NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected provider is not certified and configured for this property';
    END IF;
  END IF;

  UPDATE public.staynas_guest_payment_provider_accounts
     SET status = CASE WHEN id = _provider_config_id THEN 'active' ELSE 'inactive' END,
         updated_at = now()
   WHERE organisation_id = _organisation_id
     AND property_id = _property_id;

  _selected := _provider_config_id;
  RETURN _selected;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_set_guest_checkout_provider(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_set_guest_checkout_provider(uuid,uuid,uuid) TO service_role;
