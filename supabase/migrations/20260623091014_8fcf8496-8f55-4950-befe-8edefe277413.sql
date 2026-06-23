
-- Pricing engine config + payment verification fields
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS included_guests integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS extra_guest_fee numeric(10,2) NOT NULL DEFAULT 0;

-- Apply per-room pricing config from spec
UPDATE public.rooms SET included_guests = 2, extra_guest_fee = 30, max_occupancy = 3, capacity_adults = 2, capacity_children = 1 WHERE slug IN ('standard-river','riverfront-deluxe');
UPDATE public.rooms SET included_guests = 5, extra_guest_fee = 0,  max_occupancy = 5, capacity_adults = 5, capacity_children = 0 WHERE slug = 'family-room';

-- Payment verification fields
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_mismatch';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS paid_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_mismatch_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE;

-- Replace create_booking to apply server-authoritative pricing per room config
CREATE OR REPLACE FUNCTION public.create_booking(_room_slug text, _check_in date, _check_out date, _adults integer, _children integer, _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text, _extras jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.rooms%ROWTYPE;
  _nights int;
  _subtotal numeric := 0;
  _extras_total numeric := 0;
  _total numeric := 0;
  _deposit numeric := 0;
  _balance numeric := 0;
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
  _extra_guests int;
  _nightly_rate numeric;
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults < 1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name)) < 2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;

  SELECT * INTO _room FROM public.rooms WHERE slug = _room_slug AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found: %', _room_slug; END IF;
  IF _guests < 1 THEN RAISE EXCEPTION 'At least one guest required'; END IF;
  IF _guests > _room.max_occupancy THEN
    RAISE EXCEPTION 'Room % allows up to % guests', _room.name, _room.max_occupancy;
  END IF;

  _nights := (_check_out - _check_in);
  _extra_guests := GREATEST(0, _guests - _room.included_guests);
  _nightly_rate := _room.base_price + (_extra_guests * _room.extra_guest_fee);

  _reference := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

  INSERT INTO public.bookings (
    reference, room_id, check_in, check_out, nights, adults, children,
    guest_name, guest_email, guest_phone, country, special_requests,
    currency, source
  ) VALUES (
    _reference, _room.id, _check_in, _check_out, _nights, _adults, COALESCE(_children,0),
    trim(_guest_name), lower(trim(_guest_email)), _guest_phone, _country, _special_requests,
    _room.currency, 'website'
  ) RETURNING id INTO _booking_id;

  _d := _check_in;
  WHILE _d < _check_out LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units)
    VALUES (_room.id, _d, _room.total_units)
    ON CONFLICT (room_id, date) DO NOTHING;

    SELECT available_units, is_blocked
      INTO _units, _blocked
    FROM public.room_inventory
    WHERE room_id = _room.id AND date = _d
    FOR UPDATE;

    IF _blocked OR _units <= 0 THEN
      RAISE EXCEPTION 'No availability for % on %', _room.name, _d;
    END IF;

    -- price override (if any) replaces base, then add extra-guest fees on top
    SELECT COALESCE(price_override, _room.base_price) + (_extra_guests * _room.extra_guest_fee)
      INTO _rate
    FROM public.room_inventory
    WHERE room_id = _room.id AND date = _d;

    UPDATE public.room_inventory
      SET available_units = available_units - 1
      WHERE room_id = _room.id AND date = _d;

    INSERT INTO public.booking_nights (booking_id, room_id, date, nightly_rate)
    VALUES (_booking_id, _room.id, _d, _rate);

    _subtotal := _subtotal + _rate;
    _d := _d + INTERVAL '1 day';
  END LOOP;

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
  _deposit := ROUND((_total / 2.0)::numeric, 2);
  _balance := _total - _deposit;

  UPDATE public.bookings
    SET subtotal = _subtotal,
        extras_total = _extras_total,
        total = _total,
        deposit_amount = _deposit,
        balance_amount = _balance,
        balance_due = _balance
    WHERE id = _booking_id;

  RETURN QUERY SELECT _booking_id, _reference, _total, _room.currency;
END $function$;
