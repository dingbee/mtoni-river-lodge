-- Restore the zero-argument booking-property RPC expected by the application.
-- Staff/admin requests resolve through the authenticated user's active property.
-- Public requests resolve through the verified hostname mapping; no tenant fallback.
CREATE OR REPLACE FUNCTION public.staynas_booking_property_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property uuid;
  _headers jsonb;
  _host text;
BEGIN
  IF _uid IS NOT NULL THEN
    _property := public.staynas_active_property_id(_uid);
    IF _property IS NULL THEN
      RAISE EXCEPTION 'No active property is assigned to this user';
    END IF;
    IF NOT public.staynas_user_has_property_access(_uid, _property) THEN
      RAISE EXCEPTION 'Active property access denied';
    END IF;
    RETURN _property;
  END IF;

  _headers := COALESCE(
    NULLIF(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  _host := COALESCE(_headers->>'x-forwarded-host', _headers->>'host');
  _host := lower(trim(split_part(split_part(COALESCE(_host, ''), ',', 1), ':', 1)));

  IF _host = '' THEN
    RAISE EXCEPTION 'Booking property cannot be resolved without an authenticated property or request hostname';
  END IF;

  RETURN public.staynas_booking_property_id(_host);
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_booking_property_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staynas_booking_property_id() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
