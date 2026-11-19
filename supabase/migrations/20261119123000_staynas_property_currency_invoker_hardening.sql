-- Harden property currency mutation: rely on existing property UPDATE RLS and column-level privilege.
BEGIN;
CREATE OR REPLACE FUNCTION public.staynas_update_property_currency(_currency text)
RETURNS TABLE(property_id uuid, currency text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_property_id uuid;
  v_previous text;
  v_currency text := upper(trim(_currency));
  v_updated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter ISO 4217 code';
  END IF;
  v_property_id := public.staynas_active_property_id(v_uid);
  IF v_property_id IS NULL
     OR NOT public.staynas_user_has_property_access(v_uid, v_property_id)
     OR NOT public.has_any_role(v_uid, ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Property owner or manager access is required to change operating currency';
  END IF;
  SELECT p.currency INTO v_previous
  FROM public.staynas_properties p
  WHERE p.id = v_property_id AND p.status IN ('active','setup')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active property configuration was not found'; END IF;
  IF v_previous IS DISTINCT FROM v_currency THEN
    UPDATE public.staynas_properties AS p
    SET currency = v_currency, updated_at = now()
    WHERE p.id = v_property_id
    RETURNING p.updated_at INTO v_updated_at;
    INSERT INTO public.staynas_property_settings_audit(
      property_id, setting_key, previous_value, new_value, changed_by
    ) VALUES (v_property_id, 'currency', v_previous, v_currency, v_uid);
  ELSE
    SELECT p.updated_at INTO v_updated_at
    FROM public.staynas_properties p WHERE p.id = v_property_id;
  END IF;
  RETURN QUERY SELECT v_property_id, v_currency, v_updated_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.staynas_update_property_currency(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_update_property_currency(text) TO authenticated, service_role;
GRANT UPDATE (currency) ON public.staynas_properties TO authenticated;
COMMIT;