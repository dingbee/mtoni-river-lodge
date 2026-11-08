-- SPE-02 corrective migration: qualify PL/pgSQL output-column names in priced availability.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_staynas_room_availability_priced(
  _check_in date,
  _check_out date,
  _property_id uuid,
  _adults integer DEFAULT 1,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0
)
RETURNS TABLE(
  room_id uuid, slug text, name text, base_price numeric, currency text,
  capacity_adults integer, capacity_children integer, max_occupancy integer,
  included_guests integer, extra_guest_fee numeric, nights integer,
  nightly_total numeric, min_available integer, is_available boolean,
  fits_occupancy boolean, pricing_quote jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property is not active or does not exist';
  END IF;
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in,_check_out - interval '1 day',interval '1 day')::date AS d
  ), inventory AS (
    SELECT r.id AS room_id, dr.d,
      COALESCE(i.available_units,r.total_units) AS units,
      COALESCE(i.is_blocked,false) AS blocked,
      (SELECT count(*)::integer FROM public.booking_holds h
       WHERE h.room_id=r.id AND h.status='active' AND h.expires_at>now()
         AND h.check_in<=dr.d AND h.check_out>dr.d) AS hold_count
    FROM public.rooms r CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory i ON i.room_id=r.id AND i.date=dr.d
    WHERE r.property_id=_property_id AND r.status='active'
  ), stock AS (
    SELECT inventory.room_id, min(greatest(units-hold_count,0))::integer AS min_units,
      bool_and(NOT blocked AND units-hold_count>0) AS available
    FROM inventory GROUP BY inventory.room_id
  )
  SELECT r.id,r.slug,r.name,r.base_price,r.currency,r.capacity_adults,r.capacity_children,
    r.max_occupancy,r.included_guests,r.extra_guest_fee,(_check_out-_check_in),
    CASE WHEN q.quote IS NULL THEN 0 ELSE (q.quote->>'total')::numeric END,
    COALESCE(s.min_units,0),(COALESCE(s.available,false) AND q.quote IS NOT NULL),
    (_adults<=r.capacity_adults
      AND (_children_below_6+_children_7_plus)<=r.capacity_children
      AND (_adults+_children_below_6+_children_7_plus)<=r.max_occupancy),
    q.quote
  FROM public.rooms r
  LEFT JOIN stock s ON s.room_id=r.id
  LEFT JOIN LATERAL (
    SELECT public.try_calculate_staynas_booking_quote(
      _property_id,r.id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus
    ) AS quote
    WHERE _adults<=r.capacity_adults
      AND (_children_below_6+_children_7_plus)<=r.capacity_children
      AND (_adults+_children_below_6+_children_7_plus)<=r.max_occupancy
  ) q ON true
  WHERE r.property_id=_property_id AND r.status='active'
  ORDER BY CASE WHEN q.quote IS NULL THEN r.base_price ELSE (q.quote->>'total')::numeric END;
END;
$$;


COMMIT;
