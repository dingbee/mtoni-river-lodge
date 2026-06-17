
-- 1. Extend bookings with Pesapal tracking columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS balance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'pesapal',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS pesapal_order_tracking_id text,
  ADD COLUMN IF NOT EXISTS pesapal_merchant_reference text,
  ADD COLUMN IF NOT EXISTS payment_initiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_pesapal_tracking_idx
  ON public.bookings (pesapal_order_tracking_id);

-- 2. Update create_booking to compute 50% deposit/balance
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text, _check_in date, _check_out date,
  _adults integer, _children integer,
  _guest_name text, _guest_email text, _guest_phone text,
  _country text, _special_requests text,
  _extras jsonb DEFAULT '[]'::jsonb
) RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- Backfill existing bookings to 50% deposit/balance
UPDATE public.bookings
  SET deposit_amount = ROUND((total / 2.0)::numeric, 2),
      balance_amount = total - ROUND((total / 2.0)::numeric, 2)
  WHERE deposit_amount IS NULL OR deposit_amount = 0 OR balance_amount = 0;

-- 3. Payment events audit log
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pesapal',
  event_type text NOT NULL,
  order_tracking_id text,
  merchant_reference text,
  status_code int,
  payment_method text,
  amount numeric,
  currency text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_booking_idx ON public.payment_events(booking_id);
CREATE INDEX IF NOT EXISTS payment_events_tracking_idx ON public.payment_events(order_tracking_id);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 4. Pesapal settings (IPN id cache)
CREATE TABLE IF NOT EXISTS public.pesapal_settings (
  env text PRIMARY KEY,
  ipn_id text NOT NULL,
  ipn_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pesapal_settings TO service_role;

ALTER TABLE public.pesapal_settings ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role can access (bypasses RLS).
