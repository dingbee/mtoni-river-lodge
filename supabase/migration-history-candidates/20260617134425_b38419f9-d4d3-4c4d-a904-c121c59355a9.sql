
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','reservations','user');
CREATE TYPE public.booking_status AS ENUM ('pending','confirmed','cancelled','completed','no_show');
CREATE TYPE public.payment_status AS ENUM ('unpaid','deposit_paid','paid','refunded');
CREATE TYPE public.extra_unit AS ENUM ('per_stay','per_night','per_person','per_person_per_night');

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','reservations')) $$;

-- ============ ROOMS ============
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_description text,
  capacity_adults int NOT NULL DEFAULT 2,
  capacity_children int NOT NULL DEFAULT 0,
  max_occupancy int NOT NULL DEFAULT 2,
  total_units int NOT NULL DEFAULT 1,
  base_price numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active', -- active | inactive
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (status = 'active' OR public.is_staff(auth.uid()));
CREATE POLICY "Staff manage rooms" ON public.rooms FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ ROOM INVENTORY ============
CREATE TABLE public.room_inventory (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  date date NOT NULL,
  available_units int NOT NULL,
  price_override numeric(10,2),
  is_blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, date)
);
GRANT SELECT ON public.room_inventory TO anon, authenticated;
GRANT ALL ON public.room_inventory TO service_role;
ALTER TABLE public.room_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read inventory" ON public.room_inventory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Staff manage inventory" ON public.room_inventory FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ EXTRAS ============
CREATE TABLE public.extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL,
  unit public.extra_unit NOT NULL DEFAULT 'per_stay',
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.extras TO anon, authenticated;
GRANT ALL ON public.extras TO service_role;
ALTER TABLE public.extras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active extras" ON public.extras FOR SELECT TO anon, authenticated USING (active OR public.is_staff(auth.uid()));
CREATE POLICY "Staff manage extras" ON public.extras FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights int NOT NULL,
  adults int NOT NULL DEFAULT 1,
  children int NOT NULL DEFAULT 0,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  country text,
  special_requests text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  extras_total numeric(10,2) NOT NULL DEFAULT 0,
  taxes numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  deposit_amount numeric(10,2) NOT NULL DEFAULT 0,
  balance_due numeric(10,2) NOT NULL DEFAULT 0,
  status public.booking_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  source text NOT NULL DEFAULT 'website',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  CHECK (check_out > check_in)
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read bookings" ON public.bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff manage bookings" ON public.bookings FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ BOOKING NIGHTS ============
CREATE TABLE public.booking_nights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  date date NOT NULL,
  nightly_rate numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_nights_room_date_idx ON public.booking_nights(room_id, date);
CREATE INDEX booking_nights_booking_idx ON public.booking_nights(booking_id);
GRANT SELECT ON public.booking_nights TO authenticated;
GRANT ALL ON public.booking_nights TO service_role;
ALTER TABLE public.booking_nights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read booking nights" ON public.booking_nights FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ============ BOOKING EXTRAS ============
CREATE TABLE public.booking_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  extra_id uuid NOT NULL REFERENCES public.extras(id),
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  line_total numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.booking_extras TO authenticated;
GRANT ALL ON public.booking_extras TO service_role;
ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read booking extras" ON public.booking_extras FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON public.room_inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AVAILABILITY HELPER (public) ============
-- For each room, returns: total available units across the requested range
-- (a room is "available" only if every night has units > 0 and not blocked)
CREATE OR REPLACE FUNCTION public.get_room_availability(_check_in date, _check_out date)
RETURNS TABLE (
  room_id uuid,
  slug text,
  name text,
  base_price numeric,
  currency text,
  capacity_adults int,
  capacity_children int,
  max_occupancy int,
  nights int,
  nightly_total numeric,
  min_available int,
  is_available boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END $$;
GRANT EXECUTE ON FUNCTION public.get_room_availability(date, date) TO anon, authenticated;

-- ============ CREATE BOOKING (transactional) ============
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text,
  _check_in date,
  _check_out date,
  _adults int,
  _children int,
  _guest_name text,
  _guest_email text,
  _guest_phone text,
  _country text,
  _special_requests text,
  _extras jsonb DEFAULT '[]'::jsonb  -- [{ "slug": "...", "quantity": 1 }, ...]
) RETURNS TABLE (booking_id uuid, reference text, total numeric, currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _room public.rooms%ROWTYPE;
  _nights int;
  _subtotal numeric := 0;
  _extras_total numeric := 0;
  _total numeric := 0;
  _reference text;
  _booking_id uuid;
  _d date;
  _rate numeric;
  _units int;
  _blocked boolean;
  _extra_row record;
  _extra public.extras%ROWTYPE;
  _line numeric;
  _guests int := COALESCE(_adults,0) + COALESCE(_children,0);
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults < 1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name)) < 2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;

  SELECT * INTO _room FROM public.rooms WHERE slug = _room_slug AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found: %', _room_slug; END IF;
  IF _guests > _room.max_occupancy THEN
    RAISE EXCEPTION 'Room % allows up to % guests', _room.name, _room.max_occupancy;
  END IF;

  _nights := (_check_out - _check_in);
  _reference := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

  -- Insert booking shell first to get id
  INSERT INTO public.bookings (
    reference, room_id, check_in, check_out, nights, adults, children,
    guest_name, guest_email, guest_phone, country, special_requests,
    currency, source
  ) VALUES (
    _reference, _room.id, _check_in, _check_out, _nights, _adults, COALESCE(_children,0),
    trim(_guest_name), lower(trim(_guest_email)), _guest_phone, _country, _special_requests,
    _room.currency, 'website'
  ) RETURNING id INTO _booking_id;

  -- Loop nights: lock inventory, decrement, record night
  _d := _check_in;
  WHILE _d < _check_out LOOP
    -- Ensure inventory row exists (default to total_units)
    INSERT INTO public.room_inventory (room_id, date, available_units)
    VALUES (_room.id, _d, _room.total_units)
    ON CONFLICT (room_id, date) DO NOTHING;

    -- Lock + read
    SELECT available_units, is_blocked, COALESCE(price_override, _room.base_price)
      INTO _units, _blocked, _rate
    FROM public.room_inventory
    WHERE room_id = _room.id AND date = _d
    FOR UPDATE;

    IF _blocked OR _units <= 0 THEN
      RAISE EXCEPTION 'No availability for % on %', _room.name, _d;
    END IF;

    UPDATE public.room_inventory
      SET available_units = available_units - 1
      WHERE room_id = _room.id AND date = _d;

    INSERT INTO public.booking_nights (booking_id, room_id, date, nightly_rate)
    VALUES (_booking_id, _room.id, _d, _rate);

    _subtotal := _subtotal + _rate;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  -- Extras
  IF jsonb_array_length(_extras) > 0 THEN
    FOR _extra_row IN
      SELECT (e->>'slug') AS slug, COALESCE((e->>'quantity')::int, 1) AS quantity
      FROM jsonb_array_elements(_extras) e
    LOOP
      SELECT * INTO _extra FROM public.extras WHERE slug = _extra_row.slug AND active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found: %', _extra_row.slug; END IF;

      _line := _extra.price * _extra_row.quantity * CASE _extra.unit
        WHEN 'per_stay' THEN 1
        WHEN 'per_night' THEN _nights
        WHEN 'per_person' THEN _guests
        WHEN 'per_person_per_night' THEN _guests * _nights
      END;

      INSERT INTO public.booking_extras (booking_id, extra_id, quantity, unit_price, line_total)
      VALUES (_booking_id, _extra.id, _extra_row.quantity, _extra.price, _line);

      _extras_total := _extras_total + _line;
    END LOOP;
  END IF;

  _total := _subtotal + _extras_total;

  UPDATE public.bookings
    SET subtotal = _subtotal,
        extras_total = _extras_total,
        total = _total,
        balance_due = _total
    WHERE id = _booking_id;

  RETURN QUERY SELECT _booking_id, _reference, _total, _room.currency;
END $$;
GRANT EXECUTE ON FUNCTION public.create_booking(text, date, date, int, int, text, text, text, text, text, jsonb) TO anon, authenticated;

-- ============ SEED DATA ============
INSERT INTO public.rooms (slug, name, short_description, capacity_adults, capacity_children, max_occupancy, total_units, base_price, sort_order) VALUES
  ('riverfront-deluxe', 'Riverfront Deluxe Room', 'Closest to the water''s edge — uninterrupted river views.', 2, 1, 3, 2, 310.00, 1),
  ('standard-river',    'Standard River Room',    'Nature-facing rooms set slightly back from the river.',     2, 1, 3, 18, 260.00, 2),
  ('family-room',       'Family / Group Room',    'Generous space for families or small groups.',              4, 2, 6, 4, 360.00, 3);

INSERT INTO public.extras (slug, name, description, price, unit, sort_order) VALUES
  ('airport-transfer',      'Airport Transfer (Kilimanjaro / Arusha)', 'Private return transfer to/from JRO or ARK.', 80.00, 'per_stay', 1),
  ('breakfast',             'Breakfast',                                'Daily breakfast (already included for most rates).', 15.00, 'per_person_per_night', 2),
  ('dinner',                'Three-Course Riverside Dinner',            'Chef''s set menu with seasonal local ingredients.',  35.00, 'per_person_per_night', 3),
  ('bonfire-experience',    'Private Riverside Bonfire',                'Evening bonfire with traditional bites.',            60.00, 'per_stay', 4),
  ('guided-river-walk',     'Guided Nature & River Walk',               'Two-hour walk with a local Maasai guide.',           25.00, 'per_person', 5);
