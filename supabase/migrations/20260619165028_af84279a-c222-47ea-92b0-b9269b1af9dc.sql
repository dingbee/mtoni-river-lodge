CREATE OR REPLACE FUNCTION public.get_room_availability(_check_in date, _check_out date)
 RETURNS TABLE(room_id uuid, slug text, name text, base_price numeric, currency text, capacity_adults integer, capacity_children integer, max_occupancy integer, nights integer, nightly_total numeric, min_available integer, is_available boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _nights int;
BEGIN
  IF _check_out <= _check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in';
  END IF;
  _nights := (_check_out - _check_in);

  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in, _check_out - INTERVAL '1 day', INTERVAL '1 day')::date AS d
  ),
  per_night AS (
    SELECT
      r.id AS room_id,
      dr.d,
      COALESCE(inv.available_units, r.total_units) AS units,
      COALESCE(inv.is_blocked, false) AS blocked,
      COALESCE(inv.price_override, r.base_price) AS rate
    FROM public.rooms r
    CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory inv ON inv.room_id = r.id AND inv.date = dr.d
    WHERE r.status = 'active'
  )
  SELECT
    r.id, r.slug, r.name, r.base_price, r.currency,
    r.capacity_adults, r.capacity_children, r.max_occupancy,
    _nights,
    COALESCE(SUM(pn.rate), 0)::numeric AS nightly_total,
    COALESCE(MIN(pn.units), 0)::int AS min_available,
    (COUNT(*) FILTER (WHERE pn.blocked OR pn.units <= 0) = 0) AS is_available
  FROM public.rooms r
  LEFT JOIN per_night pn ON pn.room_id = r.id
  WHERE r.status = 'active'
  GROUP BY r.id;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_room_availability(date, date) TO anon, authenticated;