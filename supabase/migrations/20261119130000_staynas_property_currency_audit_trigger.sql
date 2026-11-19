-- Keep audit writes inside a non-callable trigger; currency RPC remains invoker-secured.
BEGIN;
CREATE OR REPLACE FUNCTION public.audit_staynas_property_currency_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF OLD.currency IS DISTINCT FROM NEW.currency THEN
    INSERT INTO public.staynas_property_settings_audit(
      property_id, setting_key, previous_value, new_value, changed_by
    ) VALUES (NEW.id, 'currency', OLD.currency, NEW.currency, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.audit_staynas_property_currency_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS staynas_property_currency_audit_trg ON public.staynas_properties;
CREATE TRIGGER staynas_property_currency_audit_trg
AFTER UPDATE OF currency ON public.staynas_properties
FOR EACH ROW
WHEN (OLD.currency IS DISTINCT FROM NEW.currency)
EXECUTE FUNCTION public.audit_staynas_property_currency_change();

CREATE OR REPLACE FUNCTION public.staynas_update_property_currency(_currency text)
RETURNS TABLE(property_id uuid, currency text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_property_id uuid;
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
  UPDATE public.staynas_properties AS p
  SET currency = v_currency, updated_at = now()
  WHERE p.id = v_property_id AND p.status IN ('active','setup')
  RETURNING p.updated_at INTO v_updated_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active property configuration was not found'; END IF;
  RETURN QUERY SELECT v_property_id, v_currency, v_updated_at;
END;
$function$;
COMMIT;