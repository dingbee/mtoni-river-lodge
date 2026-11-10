-- Public room catalogue property resolution and tenant isolation.
-- REVIEW ARTIFACT: apply only after the application changes in this branch pass CI.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_public_booking_property_id(_hostname text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _property_ids uuid[];
BEGIN
  IF _hostname IS NULL OR length(btrim(_hostname)) < 3 OR length(btrim(_hostname)) > 253
     OR btrim(_hostname) !~ '^[A-Za-z0-9.-]+$' THEN
    RAISE EXCEPTION 'A valid booking hostname is required' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT d.property_id)
    INTO _property_ids
  FROM public.staynas_property_domains d
  JOIN public.staynas_public_booking_channels c
    ON c.domain_id = d.id
   AND c.property_id = d.property_id
  JOIN public.staynas_properties p
    ON p.id = d.property_id
  WHERE lower(d.hostname) = lower(btrim(_hostname))
    AND d.verification_status = 'verified'
    AND d.verified_at IS NOT NULL
    AND c.channel_code = 'direct_web'
    AND c.status = 'published'
    AND p.status = 'active';

  IF COALESCE(array_length(_property_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No published direct booking channel is configured for this hostname'
      USING ERRCODE = 'P0002';
  ELSIF array_length(_property_ids, 1) > 1 THEN
    RAISE EXCEPTION 'Hostname maps to multiple booking properties'
      USING ERRCODE = '23505';
  END IF;

  RETURN _property_ids[1];
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_public_booking_property_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staynas_public_booking_property_id(text)
  TO anon, authenticated, service_role;

-- Public room data must be served through the hostname-scoped server API.
-- Authenticated staff retain read access only to properties they belong to.
DROP POLICY IF EXISTS "Public read active rooms" ON public.rooms;
DROP POLICY IF EXISTS "Public read active room categories" ON public.room_categories;

CREATE POLICY "Property members read active rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (status = 'active' AND public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "Property members read active room categories"
  ON public.room_categories FOR SELECT TO authenticated
  USING (status = 'active' AND public.staynas_user_has_property_access(auth.uid(), property_id));

REVOKE SELECT ON TABLE public.rooms, public.room_categories FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.rooms, public.room_categories TO authenticated, service_role;

COMMENT ON FUNCTION public.staynas_public_booking_property_id(text) IS
  'Resolves a public booking property only from an exact verified hostname with a published direct_web channel.';

COMMIT;
