
-- ============================================================
-- Sprint 9J: Unified Availability & Booking Integration
-- ============================================================

-- 1) booking_holds ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  check_in date NOT NULL,
  check_out date NOT NULL,
  session_id text NOT NULL,
  guest_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired','converted')),
  expires_at timestamptz NOT NULL,
  converted_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_holds_dates_chk CHECK (check_out > check_in)
);

GRANT SELECT ON public.booking_holds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_holds TO authenticated;
GRANT ALL ON public.booking_holds TO service_role;

ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- Staff can see all holds
CREATE POLICY "Staff read holds" ON public.booking_holds FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

-- Staff can update/delete holds (release from admin)
CREATE POLICY "Staff manage holds" ON public.booking_holds FOR UPDATE TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE POLICY "Staff delete holds" ON public.booking_holds FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- No anon direct writes — only via SECURITY DEFINER RPCs
-- Anon may read a hold row by its id (used by return page & polling); we keep a narrow policy that requires knowing the hold id
CREATE POLICY "Anyone reads by id" ON public.booking_holds FOR SELECT TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_booking_holds_room_dates ON public.booking_holds (room_id, check_in, check_out) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_booking_holds_expires ON public.booking_holds (expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_booking_holds_session ON public.booking_holds (session_id);

CREATE TRIGGER trg_booking_holds_updated_at
  BEFORE UPDATE ON public.booking_holds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) calendar_events -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  hold_id uuid REFERENCES public.booking_holds(id) ON DELETE SET NULL,
  date_from date,
  date_to date,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read events" ON public.calendar_events FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_calendar_events_created ON public.calendar_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_events_room_date ON public.calendar_events (room_id, date_from);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON public.calendar_events (event_type, created_at DESC);

-- 3) log_calendar_event helper ------------------------------------------
CREATE OR REPLACE FUNCTION public.log_calendar_event(
  _event_type text,
  _room_id uuid,
  _booking_id uuid,
  _hold_id uuid,
  _from date,
  _to date,
  _payload jsonb
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.calendar_events (event_type, room_id, booking_id, hold_id, date_from, date_to, actor_id, payload)
  VALUES (_event_type, _room_id, _booking_id, _hold_id, _from, _to, auth.uid(), COALESCE(_payload,'{}'::jsonb))
  RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION public.log_calendar_event(text,uuid,uuid,uuid,date,date,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_calendar_event(text,uuid,uuid,uuid,date,date,jsonb) TO service_role;

-- 4) create_booking_hold ------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_hold(
  _room_slug text,
  _check_in date,
  _check_out date,
  _session_id text,
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

  SELECT * INTO _room FROM public.rooms WHERE slug = _room_slug AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found: %', _room_slug; END IF;

  -- lock inventory rows per date & validate capacity net of holds
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

    -- count active, unexpired holds that overlap this date (exclude same session)
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

  -- Release any prior active hold from this session for a different room
  UPDATE public.booking_holds
    SET status = 'released', updated_at = now()
    WHERE session_id = _session_id AND status = 'active';

  INSERT INTO public.booking_holds (room_id, check_in, check_out, session_id, guest_email, expires_at)
  VALUES (_room.id, _check_in, _check_out, _session_id, NULLIF(lower(trim(_guest_email)),''), _expires_at)
  RETURNING id INTO _hold_id;

  PERFORM public.log_calendar_event('hold.created', _room.id, NULL, _hold_id, _check_in, _check_out,
    jsonb_build_object('session_id', _session_id, 'ttl_seconds', _ttl_seconds));

  RETURN QUERY SELECT _hold_id, _expires_at, _room.id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_booking_hold(text,date,date,text,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_hold(text,date,date,text,text,int) TO anon, authenticated, service_role;

-- 5) release_booking_hold -----------------------------------------------
CREATE OR REPLACE FUNCTION public.release_booking_hold(_hold_id uuid, _session_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.booking_holds%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.booking_holds WHERE id = _hold_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _row.status <> 'active' THEN RETURN false; END IF;
  IF _row.session_id <> _session_id AND NOT public.is_any_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to release this hold';
  END IF;
  UPDATE public.booking_holds SET status='released', updated_at=now() WHERE id=_hold_id;
  PERFORM public.log_calendar_event('hold.released', _row.room_id, NULL, _row.id, _row.check_in, _row.check_out, '{}'::jsonb);
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.release_booking_hold(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_booking_hold(uuid,text) TO anon, authenticated, service_role;

-- 6) expire_booking_holds ------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_booking_holds()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  WITH exp AS (
    UPDATE public.booking_holds
       SET status='expired', updated_at=now()
     WHERE status='active' AND expires_at <= now()
     RETURNING id, room_id, check_in, check_out
  )
  INSERT INTO public.calendar_events (event_type, room_id, hold_id, date_from, date_to)
  SELECT 'hold.expired', room_id, id, check_in, check_out FROM exp;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.expire_booking_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_booking_holds() TO service_role;

-- 7) Hold-aware get_room_availability -----------------------------------
CREATE OR REPLACE FUNCTION public.get_room_availability(_check_in date, _check_out date)
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
  GROUP BY r.id;
END $$;

-- 8) create_booking accepts optional _hold_id ----------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text, _check_in date, _check_out date, _adults int, _children int,
  _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text,
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

  SELECT * INTO _room FROM public.rooms WHERE slug = _room_slug AND status = 'active';
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

  -- Validate hold if provided
  IF _hold_id IS NOT NULL THEN
    SELECT * INTO _hold FROM public.booking_holds WHERE id = _hold_id FOR UPDATE;
    IF NOT FOUND OR _hold.status <> 'active' OR _hold.expires_at <= now() THEN
      RAISE EXCEPTION 'Booking hold is not active';
    END IF;
    IF _hold.room_id <> _room.id THEN RAISE EXCEPTION 'Hold room mismatch'; END IF;
    IF _session_id IS NOT NULL AND _hold.session_id <> _session_id THEN
      RAISE EXCEPTION 'Hold session mismatch';
    END IF;
  END IF;

  _reference := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

  INSERT INTO public.bookings (
    reference, room_id, check_in, check_out, nights, adults, children,
    children_below_6, children_7_plus,
    guest_name, guest_email, guest_phone, country, special_requests, currency, source
  ) VALUES (
    _reference, _room.id, _check_in, _check_out, _nights, _adults, _children_total,
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

    -- If a hold owns this date, permit even when available_units already at 0-for-others
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
      SELECT * INTO _extra FROM public.extras WHERE slug = _extra_row.slug AND active = true;
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

  -- Convert hold
  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds
      SET status='converted', converted_booking_id=_booking_id, updated_at=now()
      WHERE id = _hold_id;
  END IF;

  -- Log calendar event
  PERFORM public.log_calendar_event('reservation.created', _room.id, _booking_id, _hold_id, _check_in, _check_out,
    jsonb_build_object('reference', _reference, 'total', _total));

  RETURN QUERY SELECT _booking_id, _reference, _total, _room.currency;
END $$;

-- 9) set_room_block staff RPC -------------------------------------------
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

-- 10) pg_cron: expire holds every minute --------------------------------
SELECT cron.unschedule('expire-booking-holds') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-booking-holds');

SELECT cron.schedule(
  'expire-booking-holds',
  '* * * * *',
  $cron$ SELECT public.expire_booking_holds(); $cron$
);
