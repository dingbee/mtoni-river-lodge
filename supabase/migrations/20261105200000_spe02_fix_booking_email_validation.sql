-- SPE-02 corrective migration: use POSIX whitespace class in booking email validation.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_booking_for_property(
  _property_id uuid,
  _room_slug text,
  _check_in date,
  _check_out date,
  _adults integer,
  _children integer,
  _guest_name text,
  _guest_email text,
  _guest_phone text,
  _country text,
  _special_requests text,
  _extras jsonb DEFAULT '[]'::jsonb,
  _children_below_6 integer DEFAULT NULL,
  _children_7_plus integer DEFAULT NULL,
  _hold_id uuid DEFAULT NULL,
  _session_id text DEFAULT NULL,
  _payment_method text DEFAULT 'online'
)
RETURNS TABLE(
  booking_id uuid, reference text, total numeric, currency text,
  taxes numeric, tax_addition numeric, tax_breakdown jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_hold public.booking_holds%ROWTYPE;
  v_extra public.extras%ROWTYPE;
  v_quote jsonb;
  v_night jsonb;
  v_extra_line jsonb;
  v_day date;
  v_units integer;
  v_other_holds integer;
  v_blocked boolean;
  v_booking_id uuid;
  v_reference text;
  v_below6 integer := COALESCE(_children_below_6,0);
  v_plus7 integer := COALESCE(_children_7_plus,GREATEST(0,COALESCE(_children,0)));
  v_children_total integer;
  v_nights integer;
  v_subtotal numeric;
  v_extras_total numeric;
  v_taxes numeric;
  v_tax_addition numeric;
  v_tax_breakdown jsonb;
  v_total numeric;
  v_deposit numeric;
  v_balance numeric;
  v_payment_method text := COALESCE(_payment_method,'online');
BEGIN
  IF _property_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active'
  ) THEN RAISE EXCEPTION 'Property not found or inactive'; END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults<1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  IF v_payment_method NOT IN ('online','pay_at_property') THEN RAISE EXCEPTION 'Unsupported booking payment method'; END IF;

  SELECT * INTO v_room FROM public.rooms r
  WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;

  v_children_total := v_below6 + v_plus7;
  IF _children IS NOT NULL AND _children <> v_children_total THEN
    RAISE EXCEPTION 'Child counts do not match the supplied occupancy';
  END IF;
  v_nights := _check_out - _check_in;
  IF _hold_id IS NOT NULL THEN
    SELECT h.* INTO v_hold FROM public.booking_holds h
    JOIN public.rooms r ON r.id=h.room_id
    WHERE h.id=_hold_id AND r.property_id=_property_id
    FOR UPDATE OF h;
    IF NOT FOUND OR v_hold.status<>'active' OR v_hold.expires_at<=now() THEN
      RAISE EXCEPTION 'Booking hold invalid for property';
    END IF;
    IF v_hold.room_id<>v_room.id OR v_hold.check_in<>_check_in OR v_hold.check_out<>_check_out THEN
      RAISE EXCEPTION 'Hold does not match booking';
    END IF;
    IF _session_id IS NULL OR v_hold.session_id<>_session_id THEN RAISE EXCEPTION 'Hold session mismatch'; END IF;
  END IF;

  -- Lock the rows that determine the quote before resolving it. The final
  -- quote, nightly snapshot and inventory decrement therefore share one
  -- transactionally consistent pricing/inventory view.
  v_day := _check_in;
  WHILE v_day < _check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(v_room.id,v_day,v_room.total_units)
    ON CONFLICT(room_id,date) DO NOTHING;
    PERFORM 1 FROM public.room_inventory i
    WHERE i.room_id=v_room.id AND i.date=v_day FOR UPDATE;
    v_day := v_day + 1;
  END LOOP;

  PERFORM 1 FROM public.pricing_rules pr
  WHERE pr.property_id=_property_id AND pr.active=true
    AND (pr.scope='all' OR pr.room_id=v_room.id)
    AND (pr.starts_on IS NULL OR pr.starts_on<_check_out)
    AND (pr.ends_on IS NULL OR pr.ends_on>=_check_in)
  FOR SHARE;

  PERFORM 1 FROM public.staynas_property_tax_rules tr
  WHERE tr.property_id=_property_id AND tr.active=true
    AND (tr.valid_from IS NULL OR tr.valid_from<=_check_in)
    AND (tr.valid_to IS NULL OR tr.valid_to>=_check_in)
  FOR SHARE;

  PERFORM 1 FROM public.extras e
  WHERE e.property_id=_property_id AND e.active=true
    AND e.slug IN (
      SELECT item.value->>'slug' FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) AS item(value)
    )
  FOR SHARE;

  v_quote := public.calculate_staynas_booking_quote(
    _property_id,v_room.id,_check_in,_check_out,_adults,v_below6,v_plus7,_extras
  );
  v_room.currency := upper(v_room.currency);
  v_subtotal := (v_quote->>'accommodation_subtotal')::numeric;
  v_extras_total := (v_quote->>'extras_total')::numeric;
  v_taxes := (v_quote->>'taxes')::numeric;
  v_tax_addition := (v_quote->>'tax_addition')::numeric;
  v_tax_breakdown := COALESCE(v_quote->'tax_breakdown','[]'::jsonb);
  v_total := (v_quote->>'total')::numeric;
  v_deposit := CASE WHEN v_payment_method='pay_at_property' THEN 0 ELSE round(v_total/2,2) END;
  v_balance := v_total-v_deposit;
  v_reference := upper(substr(md5(random()::text||clock_timestamp()::text),1,10)) || '-' || to_char(now(),'YYMMDD');

  INSERT INTO public.bookings(
    reference,room_id,property_id,check_in,check_out,nights,adults,children,
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,
    special_requests,currency,source,payment_method,payment_provider,
    subtotal,extras_total,taxes,tax_addition,tax_breakdown,total,deposit_amount,balance_amount,balance_due,
    pricing_snapshot
  )
  VALUES(
    v_reference,v_room.id,_property_id,_check_in,_check_out,v_nights,_adults,v_children_total,
    v_below6,v_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,
    _special_requests,v_room.currency,'website',
    CASE WHEN v_payment_method='pay_at_property' THEN 'pay_at_property' ELSE NULL END,
    CASE WHEN v_payment_method='pay_at_property' THEN 'manual' ELSE 'pesapal' END,
    v_subtotal,v_extras_total,v_taxes,v_tax_addition,v_tax_breakdown,v_total,v_deposit,v_balance,v_balance,
    v_quote
  )
  RETURNING id INTO v_booking_id;

  FOR v_night IN SELECT value FROM jsonb_array_elements(v_quote->'nightly')
  LOOP
    v_day := (v_night->>'date')::date;
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(v_room.id,v_day,v_room.total_units)
    ON CONFLICT(room_id,date) DO NOTHING;
    SELECT i.available_units,i.is_blocked,
      (SELECT count(*)::integer FROM public.booking_holds h
       WHERE h.room_id=v_room.id AND h.status='active' AND h.expires_at>now()
         AND h.check_in<=v_day AND h.check_out>v_day
         AND (_hold_id IS NULL OR h.id<>_hold_id))
    INTO v_units,v_blocked,v_other_holds
    FROM public.room_inventory i WHERE i.room_id=v_room.id AND i.date=v_day FOR UPDATE;
    IF v_blocked THEN RAISE EXCEPTION 'Room blocked on %',v_day; END IF;
    IF v_units-COALESCE(v_other_holds,0)<=0 THEN
      RAISE EXCEPTION 'No availability on %',v_day;
    END IF;
    UPDATE public.room_inventory SET available_units=GREATEST(available_units-1,0)
    WHERE room_id=v_room.id AND date=v_day;
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate,pricing_snapshot)
    VALUES(v_booking_id,v_room.id,v_day,(v_night->>'nightly_rate')::numeric,v_night);
  END LOOP;

  FOR v_extra_line IN SELECT value FROM jsonb_array_elements(v_quote->'extras')
  LOOP
    SELECT * INTO v_extra FROM public.extras e
    WHERE e.slug=v_extra_line->>'slug' AND e.active=true AND e.property_id=_property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Extra became unavailable during booking'; END IF;
    INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total)
    VALUES(v_booking_id,v_extra.id,(v_extra_line->>'quantity')::integer,
      (v_extra_line->>'unit_price')::numeric,(v_extra_line->>'line_total')::numeric);
  END LOOP;

  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds SET status='converted',converted_booking_id=v_booking_id,updated_at=now()
    WHERE id=_hold_id;
  END IF;
  PERFORM public.log_calendar_event(
    'reservation.created',v_room.id,v_booking_id,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'reference',v_reference,'total',v_total,'currency',v_room.currency)
  );
  RETURN QUERY SELECT v_booking_id,v_reference,v_total,v_room.currency,v_taxes,v_tax_addition,v_tax_breakdown;
END;
$$;


COMMIT;
