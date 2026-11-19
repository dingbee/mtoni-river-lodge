-- Property-scoped operating currency configuration.
-- Changes only the property's future operating currency; historical commercial records retain their own currency.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_property_settings_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  setting_key text NOT NULL CHECK (setting_key IN ('currency')),
  previous_value text,
  new_value text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staynas_property_settings_audit_property_time_idx
  ON public.staynas_property_settings_audit(property_id, changed_at DESC);

ALTER TABLE public.staynas_property_settings_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staynas_property_settings_audit_read ON public.staynas_property_settings_audit;
CREATE POLICY staynas_property_settings_audit_read
  ON public.staynas_property_settings_audit FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[])
  );
GRANT SELECT ON public.staynas_property_settings_audit TO authenticated;
GRANT ALL ON public.staynas_property_settings_audit TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_update_property_currency(_currency text)
RETURNS TABLE(property_id uuid, currency text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
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
    UPDATE public.staynas_properties
    SET currency = v_currency, updated_at = now()
    WHERE id = v_property_id
    RETURNING public.staynas_properties.updated_at INTO v_updated_at;

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

COMMIT;
