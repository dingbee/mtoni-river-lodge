CREATE OR REPLACE FUNCTION public.get_room_availability(
  _check_in date,
  _check_out date,
  _property_id uuid
)
RETURNS TABLE(
  room_id uuid, slug text, name text, base_price numeric, currency text,
  capacity_adults integer, capacity_children integer, max_occupancy integer,
  nights integer, nightly_total numeric, min_available integer, is_available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _nights integer;
  _jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF _check_out <= _check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in';
  END IF;
  IF _property_id IS NULL THEN
    RAISE EXCEPTION 'property_id is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    WHERE p.id = _property_id AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Property is not active or does not exist';
  END IF;
  IF _jwt_role <> 'service_role' AND (
    auth.uid() IS NULL
    OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for requested property';
  END IF;

  _nights := (_check_out - _check_in);

  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in, _check_out - INTERVAL '1 day', INTERVAL '1 day')::date AS d
  ),
  per_night AS (
    SELECT r.id AS room_id, dr.d,
           COALESCE(inv.available_units, r.total_units) AS units,
           COALESCE(inv.is_blocked, false) AS blocked,
           COALESCE(inv.price_override, r.base_price) AS rate,
           (SELECT COUNT(*) FROM public.booking_holds h
             WHERE h.room_id = r.id AND h.status = 'active' AND h.expires_at > now()
               AND h.check_in <= dr.d AND h.check_out > dr.d) AS hold_count
    FROM public.rooms r
    CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory inv ON inv.room_id = r.id AND inv.date = dr.d
    WHERE r.status = 'active' AND r.property_id = _property_id
  )
  SELECT r.id, r.slug, r.name, r.base_price, r.currency,
         r.capacity_adults, r.capacity_children, r.max_occupancy,
         _nights,
         COALESCE(SUM(pn.rate), 0)::numeric,
         COALESCE(MIN(GREATEST(pn.units - pn.hold_count, 0)), 0)::integer,
         (COUNT(*) FILTER (WHERE pn.blocked OR (pn.units - pn.hold_count) <= 0) = 0)
  FROM public.rooms r
  LEFT JOIN per_night pn ON pn.room_id = r.id
  WHERE r.status = 'active' AND r.property_id = _property_id
  GROUP BY r.id;
END
$function$;

REVOKE ALL ON FUNCTION public.get_room_availability(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_availability(date, date, uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';