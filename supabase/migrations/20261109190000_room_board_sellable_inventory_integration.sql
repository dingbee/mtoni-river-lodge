-- Room Board operational states must reduce sellable room stock in both
-- public availability contracts. Reservations/holds already reduce stock
-- through room_inventory and booking_holds, so occupied/reserved units are
-- deliberately excluded to avoid double-counting allocated inventory.
--
-- A dirty, inspection, maintenance or out-of-service physical unit is not
-- sellable until Housekeeping/Operations restores it to vacant_clean.

CREATE OR REPLACE FUNCTION public.get_room_availability(
  _check_in date,
  _check_out date,
  _property_id uuid
)
RETURNS TABLE(
  room_id uuid,
  slug text,
  name text,
  base_price numeric,
  currency text,
  capacity_adults integer,
  capacity_children integer,
  max_occupancy integer,
  nights integer,
  nightly_total numeric,
  min_available integer,
  is_available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _nights integer;
  _jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
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
    SELECT
      r.id AS room_id,
      dr.d,
      GREATEST(
        COALESCE(inv.available_units, r.total_units)
        - LEAST(
            COALESCE(inv.available_units, r.total_units),
            (
              SELECT COUNT(*)::integer
              FROM public.room_states rs
              WHERE rs.room_id = r.id
                AND rs.property_id = r.property_id
                AND rs.booking_id IS NULL
                AND rs.state::text IN ('vacant_dirty', 'inspection', 'maintenance', 'out_of_service')
            )
          ),
        0
      ) AS units,
      COALESCE(inv.is_blocked, false) AS blocked,
      COALESCE(inv.price_override, r.base_price) AS rate,
      (
        SELECT COUNT(*)::integer
        FROM public.booking_holds h
        WHERE h.room_id = r.id
          AND h.status = 'active'
          AND h.expires_at > now()
          AND h.check_in <= dr.d
          AND h.check_out > dr.d
      ) AS hold_count
    FROM public.rooms r
    CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory inv
      ON inv.room_id = r.id AND inv.date = dr.d
    WHERE r.status = 'active' AND r.property_id = _property_id
  )
  SELECT
    r.id,
    r.slug,
    r.name,
    r.base_price,
    r.currency,
    r.capacity_adults,
    r.capacity_children,
    r.max_occupancy,
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

CREATE OR REPLACE FUNCTION public.get_staynas_room_availability_priced(
  _check_in date,
  _check_out date,
  _property_id uuid,
  _adults integer DEFAULT 1,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0
)
RETURNS TABLE(
  room_id uuid,
  slug text,
  name text,
  base_price numeric,
  currency text,
  capacity_adults integer,
  capacity_children integer,
  max_occupancy integer,
  included_guests integer,
  extra_guest_fee numeric,
  nights integer,
  nightly_total numeric,
  min_available integer,
  is_available boolean,
  fits_occupancy boolean,
  pricing_quote jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _check_out <= _check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    WHERE p.id = _property_id AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Property is not active or does not exist';
  END IF;

  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in, _check_out - interval '1 day', interval '1 day')::date AS d
  ),
  inventory AS (
    SELECT
      r.id AS room_id,
      dr.d,
      COALESCE(i.available_units, r.total_units) AS configured_units,
      COALESCE(i.is_blocked, false) AS blocked,
      (
        SELECT COUNT(*)::integer
        FROM public.room_states rs
        WHERE rs.room_id = r.id
          AND rs.property_id = r.property_id
          AND rs.booking_id IS NULL
          AND rs.state::text IN ('vacant_dirty', 'inspection', 'maintenance', 'out_of_service')
      ) AS operational_blocks,
      (
        SELECT COUNT(*)::integer
        FROM public.booking_holds h
        WHERE h.room_id = r.id
          AND h.status = 'active'
          AND h.expires_at > now()
          AND h.check_in <= dr.d
          AND h.check_out > dr.d
      ) AS hold_count
    FROM public.rooms r
    CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory i
      ON i.room_id = r.id AND i.date = dr.d
    WHERE r.property_id = _property_id AND r.status = 'active'
  ),
  stock AS (
    SELECT
      inventory.room_id,
      MIN(GREATEST(
        configured_units - LEAST(configured_units, operational_blocks) - hold_count,
        0
      ))::integer AS min_units,
      BOOL_AND(
        NOT blocked
        AND configured_units - LEAST(configured_units, operational_blocks) - hold_count > 0
      ) AS available
    FROM inventory
    GROUP BY inventory.room_id
  )
  SELECT
    r.id,
    r.slug,
    r.name,
    r.base_price,
    r.currency,
    r.capacity_adults,
    r.capacity_children,
    r.max_occupancy,
    r.included_guests,
    r.extra_guest_fee,
    (_check_out - _check_in),
    CASE
      WHEN q.quote IS NULL OR q.quote->>'ok' = 'false' THEN 0
      ELSE (q.quote->>'total')::numeric
    END,
    COALESCE(s.min_units, 0),
    (
      COALESCE(s.available, false)
      AND q.quote IS NOT NULL
      AND COALESCE(q.quote->>'ok', 'true') <> 'false'
    ),
    (
      _adults <= r.capacity_adults
      AND (_children_below_6 + _children_7_plus) <= r.capacity_children
      AND (_adults + _children_below_6 + _children_7_plus) <= r.max_occupancy
    ),
    q.quote
  FROM public.rooms r
  LEFT JOIN stock s ON s.room_id = r.id
  LEFT JOIN LATERAL (
    SELECT public.try_calculate_staynas_booking_quote(
      _property_id,
      r.id,
      _check_in,
      _check_out,
      _adults,
      _children_below_6,
      _children_7_plus
    ) AS quote
    WHERE _adults <= r.capacity_adults
      AND (_children_below_6 + _children_7_plus) <= r.capacity_children
      AND (_adults + _children_below_6 + _children_7_plus) <= r.max_occupancy
  ) q ON true
  WHERE r.property_id = _property_id AND r.status = 'active'
  ORDER BY
    CASE WHEN q.quote IS NULL OR q.quote->>'ok' = 'false' THEN 1 ELSE 0 END,
    CASE
      WHEN q.quote IS NULL OR q.quote->>'ok' = 'false' THEN r.base_price
      ELSE (q.quote->>'total')::numeric
    END;
END;
$function$;

COMMENT ON FUNCTION public.get_room_availability(date, date, uuid) IS
  'Property-scoped availability; excludes unallocated dirty, inspection, maintenance and out-of-service physical units in addition to date inventory and active holds.';

COMMENT ON FUNCTION public.get_staynas_room_availability_priced(date, date, uuid, integer, integer, integer) IS
  'Canonical priced availability; excludes unallocated dirty, inspection, maintenance and out-of-service physical units without double-counting booked/held inventory.';
