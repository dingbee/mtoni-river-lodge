CREATE OR REPLACE FUNCTION public.staynas_booking_property_id(_hostname text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _property uuid;
  _host text;
BEGIN
  _host := lower(trim(split_part(COALESCE(_hostname,''), ':', 1)));
  IF _host = '' OR _host !~ '^[a-z0-9.-]+$' THEN
    RAISE EXCEPTION 'Valid property hostname is required';
  END IF;

  SELECT d.property_id INTO _property
  FROM public.staynas_property_domains d
  JOIN public.staynas_properties p ON p.id = d.property_id
  WHERE d.hostname = _host
    AND d.verified_at IS NOT NULL
    AND p.status = 'active';

  IF _property IS NULL THEN
    RAISE EXCEPTION 'No active property is configured for this hostname';
  END IF;
  RETURN _property;
END;
$$;
REVOKE ALL ON FUNCTION public.staynas_booking_property_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staynas_booking_property_id(text) TO anon, authenticated, service_role;

ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read own property booking extras" ON public.booking_extras;
CREATE POLICY "Staff read own property booking extras"
  ON public.booking_extras FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_extras.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  ));
DROP POLICY IF EXISTS "Staff manage own property booking extras" ON public.booking_extras;
CREATE POLICY "Staff manage own property booking extras"
  ON public.booking_extras FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_extras.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_extras.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  ));

DROP POLICY IF EXISTS "Staff read payment events for accessible properties" ON public.payment_events;
CREATE POLICY "Staff read payment events for accessible properties"
  ON public.payment_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = payment_events.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  ));