-- StayNas booking property isolation
-- ============================================================
-- Security milestone: make public Mtoni booking explicitly property-scoped
-- end-to-end. Availability, holds, booking creation, extras, hold lookup and
-- release all resolve and enforce the single configured booking property.
--
-- REVIEW ARTIFACT — NOT APPLIED. This file lives outside supabase/migrations/
-- on purpose so no migrator picks it up. After review, apply it through the
-- database migration tool (which records it in the migration journal). The
-- application code in this change passes _property_id to every booking RPC;
-- applying this migration without the code (or vice versa) breaks the
-- booking flow.
--
-- What this does:
--   1. Adds a singleton staynas_booking_config row naming the one property
--      the public booking engine is allowed to serve.
--   2. Adds staynas_booking_property_id() — the single resolver every
--      booking path uses. Raises when missing or pointing at an inactive
--      property (rejects missing/ambiguous property context).
--   3. Adds property_id to booking_holds (backfilled from the hold's room)
--      with a trigger keeping hold property == room property.
--   4. Creates property-scoped overloads of get_room_availability,
--      create_booking_hold, create_booking, release_booking_hold and
--      get_booking_hold_for_session. Each validates _property_id against the
--      configured booking property and verifies every room/extra/hold it
--      touches belongs to that property.
--   5. Drops the legacy unscoped overloads. They resolve rooms/extras by
--      slug alone; slugs are only unique per property since
--      20260926150000, so the legacy entry points are ambiguous and cannot
--      be kept securely.
--   6. Replaces booking_holds staff RLS policies with property-scoped ones
--      (matching the existing staynas_property_members model) and hardens
--      set_room_block with a property-membership check.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Singleton booking configuration (which property the public engine serves)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staynas_booking_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staynas_booking_config ENABLE ROW LEVEL SECURITY;

-- Nobody reads or writes this table directly; the SECURITY DEFINER resolver
-- below is the only read path and service_role the only write path.
REVOKE ALL ON public.staynas_booking_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_booking_config TO service_role;

-- Seed with the current single production property (Nolmark CDMA / Mtoni).
INSERT INTO public.staynas_booking_config (id, property_id)
SELECT true, p.id
FROM public.staynas_properties p
WHERE p.slug = 'nolmark-cdma-staynas'
  AND p.status = 'active'
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Configured-property resolver — raises on missing/ambiguous context
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staynas_booking_property_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _property uuid;
BEGIN
  SELECT c.property_id INTO _property
  FROM public.staynas_booking_config c
  WHERE c.id = true;

  IF _property IS NULL THEN
    RAISE EXCEPTION 'Booking property is not configured';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    WHERE p.id = _property AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Configured booking property is not active';
  END IF;

  RETURN _property;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_booking_property_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staynas_booking_property_id() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. booking_holds.property_id + consistency trigger
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking_holds
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

UPDATE public.booking_holds h
SET property_id = r.property_id
FROM public.rooms r
WHERE h.room_id = r.id
  AND h.property_id IS NULL;

-- Fail loudly rather than leave unscoped rows behind.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_holds WHERE property_id IS NULL) THEN
    RAISE EXCEPTION 'booking_holds rows exist whose property cannot be resolved from their room';
  END IF;
END $$;

ALTER TABLE public.booking_holds ALTER COLUMN property_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_holds_property_active
  ON public.booking_holds (property_id, status, expires_at);

CREATE OR REPLACE FUNCTION public.staynas_enforce_hold_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _room_property uuid;
BEGIN
  SELECT property_id INTO _room_property FROM public.rooms WHERE id = NEW.room_id;
  IF _room_property IS NULL THEN RAISE EXCEPTION 'Room property is required'; END IF;
  IF NEW.property_id IS NULL THEN NEW.property_id := _room_property; END IF;
  IF NEW.property_id <> _room_property THEN
    RAISE EXCEPTION 'Hold property does not match room property';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_booking_holds_property_trg ON public.booking_holds;
CREATE TRIGGER staynas_booking_holds_property_trg
BEFORE INSERT OR UPDATE OF room_id, property_id ON public.booking_holds
FOR EACH ROW EXECUTE FUNCTION public.staynas_enforce_hold_property();

-- ---------------------------------------------------------------------------
-- 4. Property-scoped RPC overloads
-- ---------------------------------------------------------------------------

-- 4a. Availability, scoped to the configured booking property.
CREATE OR REPLACE FUNCTION public.get_room_availability(
  _check_in date,
  _check_out date,
  _property_id uuid
)
RETURNS TABLE(
  room_id uuid, slug text, name text, base_price numeric, currency text,
  capacity_adults int, capacity_children int, max_occupancy int,
  nights int, nightly_total numeric, min_available int, is_available boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _nights int;
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _property_id IS NULL OR _property_id <> public.staynas_booking_property_id() THEN
    RAISE EXCEPTION 'Invalid property context';
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
              WHERE h.room_id = r.id AND h.status='active' AND h.expires_at > now()
                AND h.check_in <= dr.d AND h.check_out > dr.d) AS hold_count
    FROM public.rooms r
    CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory inv ON inv.room_id = r.id AND inv.date = dr.d
    WHERE r.status = 'active'
      AND r.property_id = _property_id
  )
  SELECT r.id, r.slug, r.name, r.base_price, r.currency,
         r.capacity_adults, r.capacity_children, r.max_occupancy,
         _nights,
         COALESCE(SUM(pn.rate), 0)::numeric AS nightly_total,
         COALESCE(MIN(GREATEST(pn.units - pn.hold_count, 0)), 0)::int AS min_available,
         (COUNT(*) FILTER (WHERE pn.blocked OR (pn.units - pn.hold_count) <= 0) = 0) AS is_available
  FROM public.rooms r
  LEFT JOIN per_night pn ON pn.room_id = r.id
  WHERE r.status = 'active'
    AND r.property_id = _property_id
  GROUP BY r.id;
END $$;

REVOKE ALL ON FUNCTION public.get_room_availability(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_availability(date, date, uuid) TO anon, authenticated, service_role;

-- 4b. Hold creation, scoped to the configured booking property.
CREATE OR REPLACE FUNCTION public.create_booking_hold(
  _room_slug text,
  _check_in date,
  _check_out date,
  _session_id text,
  _property_id uuid,
  _guest_email text DEFAULT NULL,
  _ttl_seconds int DEFAULT 900
) RETURNS TABLE(hold_id uuid, expires_at timestamptz, room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.rooms%ROWTYPE;
  _d date;
  _units int;
  _blocked boolean;
  _hold_count int;
  _hold_id uuid;
  _expires_at timestamptz;
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _session_id IS NULL OR length(trim(_session_id)) < 6 THEN RAISE EXCEPTION 'session_id required'; END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds < 60 OR _ttl_seconds > 3600 THEN _ttl_seconds := 900; END IF;
  IF _property_id IS NULL OR _property_id <> public.staynas_booking_property_id() THEN
    RAISE EXCEPTION 'Invalid property context';
  END IF;

  SELECT * INTO _room FROM public.rooms
  WHERE slug = _room_slug AND status = 'active' AND property_id = _property_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found: %', _room_slug; END IF;

  _d := _check_in;
  WHILE _d < _check_out LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units)
    VALUES (_room.id, _d, _room.total_units)
    ON CONFLICT (room_id, date) DO NOTHING;

    SELECT available_units, is_blocked INTO _units, _blocked
    FROM public.room_inventory
    WHERE room_id = _room.id AND date = _d
    FOR UPDATE;

    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %', _d; END IF;

    SELECT COUNT(*) INTO _hold_count
    FROM public.booking_holds h
    WHERE h.room_id = _room.id
      AND h.status = 'active'
      AND h.expires_at > now()
      AND h.session_id <> _session_id
      AND h.check_in <= _d
      AND h.check_out > _d;

    IF _units - _hold_count <= 0 THEN
      RAISE EXCEPTION 'No availability for % on %', _room.name, _d;
    END IF;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  _expires_at := now() + make_interval(secs => _ttl_seconds);

  UPDATE public.booking_holds
    SET status = 'released', updated_at = now()
    WHERE session_id = _session_id AND status = 'active';

  INSERT INTO public.booking_holds (room_id, property_id, check_in, check_out, session_id, guest_email, expires_at)
  VALUES (_room.id, _room.property_id, _check_in, _check_out, _session_id, NULLIF(lower(trim(_guest_email)),''), _expires_at)
  RETURNING id INTO _hold_id;

  PERFORM public.log_calendar_event('hold.created', _room.id, NULL, _hold_id, _check_in, _check_out,
    jsonb_build_object('session_id', _session_id, 'ttl_seconds', _ttl_seconds, 'property_id', _room.property_id));

  RETURN QUERY SELECT _hold_id, _expires_at, _room.id;
END $$;

REVOKE ALL ON FUNCTION public.create_booking_hold(text,date,date,text,uuid,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_hold(text,date,date,text,uuid,text,int) TO anon, authenticated, service_role;

-- 4c. Booking creation, scoped to the configured booking property.
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text, _check_in date, _check_out date, _adults int, _children int,
  _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text,
  _property_id uuid,
  _extras jsonb DEFAULT '[]'::jsonb,
  _children_below_6 int DEFAULT NULL, _children_7_plus int DEFAULT NULL,
  _hold_id uuid DEFAULT NULL, _session_id text DEFAULT NULL
) RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.rooms%ROWTYPE;
  _nights int; _subtotal numeric := 0; _extras_total numeric := 0;
  _total numeric := 0; _deposit numeric := 0; _balance numeric := 0;
  _reference text; _booking_id uuid;
  _d date; _rate numeric; _units int; _blocked boolean;
  _extra_row record; _extra public.extras%ROWTYPE; _line numeric;
  _below6 int := COALESCE(_children_below_6, 0);
  _plus7 int := COALESCE(_children_7_plus, GREATEST(0, COALESCE(_children,0)));
  _children_total int; _total_occupants int; _paid_occupants int; _extra_occupants int;
  _hold public.booking_holds%ROWTYPE;
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults < 1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name)) < 2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  IF _property_id IS NULL OR _property_id <> public.staynas_booking_property_id() THEN
    RAISE EXCEPTION 'Invalid property context';
  END IF;

  SELECT * INTO _room FROM public.rooms
  WHERE slug = _room_slug AND status = 'active' AND property_id = _property_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found: %', _room_slug; END IF;

  _children_total := _below6 + _plus7;
  _total_occupants := _adults + _children_total;
  IF _total_occupants < 1 THEN RAISE EXCEPTION 'At least one occupant required'; END IF;
  IF _total_occupants > _room.max_occupancy THEN
    RAISE EXCEPTION 'Room % allows up to % occupants', _room.name, _room.max_occupancy;
  END IF;

  _paid_occupants := _adults + _plus7;
  _nights := (_check_out - _check_in);
  _extra_occupants := GREATEST(0, _paid_occupants - _room.included_guests);

  -- Validate hold if provided: must be active, unexpired, same room, same property.
  IF _hold_id IS NOT NULL THEN
    SELECT * INTO _hold FROM public.booking_holds WHERE id = _hold_id FOR UPDATE;
    IF NOT FOUND OR _hold.status <> 'active' OR _hold.expires_at <= now() THEN
      RAISE EXCEPTION 'Booking hold is not active';
    END IF;
    IF _hold.property_id <> _property_id THEN
      RAISE EXCEPTION 'Hold belongs to another property';
    END IF;
    IF _hold.room_id <> _room.id THEN RAISE EXCEPTION 'Hold room mismatch'; END IF;
    IF _session_id IS NOT NULL AND _hold.session_id <> _session_id THEN
      RAISE EXCEPTION 'Hold session mismatch';
    END IF;
  END IF;

  _reference := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

  INSERT INTO public.bookings (
    reference, room_id, property_id, check_in, check_out, nights, adults, children,
    children_below_6, children_7_plus,
    guest_name, guest_email, guest_phone, country, special_requests, currency, source
  ) VALUES (
    _reference, _room.id, _room.property_id, _check_in, _check_out, _nights, _adults, _children_total,
    _below6, _plus7,
    trim(_guest_name), lower(trim(_guest_email)), _guest_phone, _country, _special_requests,
    _room.currency, 'website'
  ) RETURNING id INTO _booking_id;

  _d := _check_in;
  WHILE _d < _check_out LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units)
    VALUES (_room.id, _d, _room.total_units)
    ON CONFLICT (room_id, date) DO NOTHING;

    SELECT available_units, is_blocked INTO _units, _blocked
    FROM public.room_inventory WHERE room_id = _room.id AND date = _d FOR UPDATE;

    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %', _d; END IF;
    IF _units <= 0 AND _hold_id IS NULL THEN
      RAISE EXCEPTION 'No availability for % on %', _room.name, _d;
    END IF;

    SELECT COALESCE(price_override, _room.base_price) + (_extra_occupants * _room.extra_guest_fee)
      INTO _rate FROM public.room_inventory WHERE room_id = _room.id AND date = _d;

    UPDATE public.room_inventory SET available_units = GREATEST(available_units - 1, 0)
      WHERE room_id = _room.id AND date = _d;

    INSERT INTO public.booking_nights (booking_id, room_id, date, nightly_rate)
    VALUES (_booking_id, _room.id, _d, _rate);

    _subtotal := _subtotal + _rate;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  IF jsonb_array_length(_extras) > 0 THEN
    FOR _extra_row IN SELECT (e->>'slug') AS slug, COALESCE((e->>'quantity')::int,1) AS quantity
                       FROM jsonb_array_elements(_extras) e LOOP
      -- Extras are property-owned: refuse extras from any other property.
      SELECT * INTO _extra FROM public.extras
      WHERE slug = _extra_row.slug AND active = true AND property_id = _property_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found: %', _extra_row.slug; END IF;
      _line := _extra.price * _extra_row.quantity * CASE _extra.unit
        WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights
        WHEN 'per_person' THEN _total_occupants
        WHEN 'per_person_per_night' THEN _total_occupants * _nights END;
      INSERT INTO public.booking_extras (booking_id, extra_id, quantity, unit_price, line_total)
      VALUES (_booking_id, _extra.id, _extra_row.quantity, _extra.price, _line);
      _extras_total := _extras_total + _line;
    END LOOP;
  END IF;

  _total := _subtotal + _extras_total;
  _deposit := ROUND((_total / 2.0)::numeric, 2);
  _balance := _total - _deposit;

  UPDATE public.bookings SET subtotal=_subtotal, extras_total=_extras_total,
    total=_total, deposit_amount=_deposit, balance_amount=_balance, balance_due=_balance
    WHERE id = _booking_id;

  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds
      SET status='converted', converted_booking_id=_booking_id, updated_at=now()
      WHERE id = _hold_id;
  END IF;

  PERFORM public.log_calendar_event('reservation.created', _room.id, _booking_id, _hold_id, _check_in, _check_out,
    jsonb_build_object('reference', _reference, 'total', _total, 'property_id', _room.property_id));

  RETURN QUERY SELECT _booking_id, _reference, _total, _room.currency;
END $$;

REVOKE ALL ON FUNCTION public.create_booking(text,date,date,int,int,text,text,text,text,text,uuid,jsonb,int,int,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,int,int,text,text,text,text,text,uuid,jsonb,int,int,uuid,text) TO anon, authenticated, service_role;

-- 4d. Hold release, scoped to the configured booking property.
CREATE OR REPLACE FUNCTION public.release_booking_hold(_hold_id uuid, _session_id text, _property_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.booking_holds%ROWTYPE;
BEGIN
  IF _property_id IS NULL OR _property_id <> public.staynas_booking_property_id() THEN
    RAISE EXCEPTION 'Invalid property context';
  END IF;
  SELECT * INTO _row FROM public.booking_holds WHERE id = _hold_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _row.property_id <> _property_id THEN
    RAISE EXCEPTION 'Hold belongs to another property';
  END IF;
  IF _row.status <> 'active' THEN RETURN false; END IF;
  IF _row.session_id <> _session_id AND NOT public.is_any_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to release this hold';
  END IF;
  UPDATE public.booking_holds SET status='released', updated_at=now() WHERE id=_hold_id;
  PERFORM public.log_calendar_event('hold.released', _row.room_id, NULL, _row.id, _row.check_in, _row.check_out, '{}'::jsonb);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.release_booking_hold(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_booking_hold(uuid,text,uuid) TO anon, authenticated, service_role;

-- 4e. Hold lookup, scoped to the configured booking property.
CREATE OR REPLACE FUNCTION public.get_booking_hold_for_session(_hold_id uuid, _session_id text, _property_id uuid)
RETURNS TABLE (
  id uuid, room_id uuid, check_in date, check_out date,
  expires_at timestamptz, status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.room_id, h.check_in, h.check_out, h.expires_at, h.status::text
  FROM public.booking_holds h
  WHERE h.id = _hold_id
    AND _session_id IS NOT NULL
    AND length(trim(_session_id)) >= 6
    AND h.session_id = _session_id
    AND _property_id IS NOT NULL
    AND _property_id = public.staynas_booking_property_id()
    AND h.property_id = _property_id
$$;

REVOKE ALL ON FUNCTION public.get_booking_hold_for_session(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_hold_for_session(uuid,text,uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Retire legacy unscoped overloads.
-- These resolve rooms/extras by slug alone. Slugs are unique only per
-- property since 20260926150000, so these entry points are ambiguous across
-- properties and cannot be preserved securely. All application call sites
-- were moved to the property-scoped overloads in the same change.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_room_availability(date, date);
DROP FUNCTION IF EXISTS public.create_booking_hold(text, date, date, text, text, integer);
DROP FUNCTION IF EXISTS public.release_booking_hold(uuid, text);
DROP FUNCTION IF EXISTS public.get_booking_hold_for_session(uuid, text);
DROP FUNCTION IF EXISTS public.create_booking(text, date, date, integer, integer, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_booking(text, date, date, integer, integer, text, text, text, text, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.create_booking(text, date, date, integer, integer, text, text, text, text, text, jsonb, integer, integer, uuid, text);

-- ---------------------------------------------------------------------------
-- 6. Property-scoped RLS for booking_holds (matches the existing
-- staynas_property_members model; no other tables touched).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff read holds" ON public.booking_holds;
DROP POLICY IF EXISTS "Staff manage holds" ON public.booking_holds;
DROP POLICY IF EXISTS "Staff delete holds" ON public.booking_holds;
DROP POLICY IF EXISTS "Anyone reads by id" ON public.booking_holds;

CREATE POLICY "Staff read own property holds"
  ON public.booking_holds FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "Staff manage own property holds"
  ON public.booking_holds FOR UPDATE TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id))
  WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "Admins delete own property holds"
  ON public.booking_holds FOR DELETE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

-- ---------------------------------------------------------------------------
-- 7. Harden set_room_block: require membership of the room's property, not
-- just a global staff role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_room_block(
  _room_id uuid, _from date, _to date, _blocked boolean, _reason text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _d date; _n int := 0; _room public.rooms%ROWTYPE;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _to <= _from THEN RAISE EXCEPTION 'to must be after from'; END IF;

  SELECT * INTO _room FROM public.rooms WHERE id = _room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  IF NOT public.staynas_user_has_property_access(auth.uid(), _room.property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;

  _d := _from;
  WHILE _d < _to LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units, is_blocked)
    VALUES (_room_id, _d, _room.total_units, _blocked)
    ON CONFLICT (room_id, date) DO UPDATE SET is_blocked = EXCLUDED.is_blocked, updated_at = now();
    _n := _n + 1;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  PERFORM public.log_calendar_event(
    CASE WHEN _blocked THEN 'room.blocked' ELSE 'room.unblocked' END,
    _room_id, NULL, NULL, _from, _to,
    jsonb_build_object('reason', COALESCE(_reason,''))
  );
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_room_block(uuid,date,date,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_block(uuid,date,date,boolean,text) TO authenticated, service_role;

COMMENT ON TABLE public.staynas_booking_config IS
'Singleton configuration naming the one property the public booking engine serves. service_role-managed; read only through staynas_booking_property_id().';

COMMENT ON TABLE public.booking_holds IS
'StayNas booking holds scoped to a canonical property (property_id enforced by trigger against the hold''s room).';
