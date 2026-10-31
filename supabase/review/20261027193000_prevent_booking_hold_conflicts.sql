-- Prevent direct reservations from consuming inventory already held by another session.
-- Review artifact only. Apply through the approved migration process after test approval.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_booking_for_property(_property_id uuid, _room_slug text, _check_in date, _check_out date, _adults integer, _children integer, _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text, _extras jsonb DEFAULT '[]'::jsonb, _children_below_6 integer DEFAULT NULL::integer, _children_7_plus integer DEFAULT NULL::integer, _hold_id uuid DEFAULT NULL::uuid, _session_id text DEFAULT NULL::text)
 RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.rooms%ROWTYPE; _hold public.booking_holds%ROWTYPE; _extra public.extras%ROWTYPE;
  _item record; _d date; _nights integer; _units integer; _blocked boolean; _hold_count integer; _rate numeric;
  _subtotal numeric:=0; _extras_total numeric:=0; _total numeric:=0; _deposit numeric:=0; _balance numeric:=0;
  _reference text; _booking_id uuid; _below6 integer:=COALESCE(_children_below_6,0);
  _plus7 integer:=COALESCE(_children_7_plus,GREATEST(0,COALESCE(_children,0)));
  _children_total integer; _occupants integer; _paid_occupants integer; _extra_occupants integer; _line numeric;
BEGIN
  IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property not found or inactive';
  END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults<1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  SELECT * INTO _room FROM public.rooms r WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;
  _children_total:=_below6+_plus7; _occupants:=_adults+_children_total;
  IF _occupants>_room.max_occupancy THEN RAISE EXCEPTION 'Room occupancy exceeded'; END IF;
  _paid_occupants:=_adults+_plus7; _extra_occupants:=GREATEST(0,_paid_occupants-_room.included_guests);
  _nights:=_check_out-_check_in;
  IF _hold_id IS NOT NULL THEN
    SELECT h.* INTO _hold FROM public.booking_holds h JOIN public.rooms r ON r.id=h.room_id
      WHERE h.id=_hold_id AND r.property_id=_property_id FOR UPDATE OF h;
    IF NOT FOUND OR _hold.status<>'active' OR _hold.expires_at<=now() THEN RAISE EXCEPTION 'Booking hold invalid for property'; END IF;
    IF _hold.room_id<>_room.id OR _hold.check_in<>_check_in OR _hold.check_out<>_check_out THEN RAISE EXCEPTION 'Hold does not match booking'; END IF;
    IF _session_id IS NULL OR _hold.session_id<>_session_id THEN RAISE EXCEPTION 'Hold session mismatch'; END IF;
  END IF;
  _reference := upper(substr(md5(random()::text||clock_timestamp()::text),1,10)) || '-' || to_char(now(),'YYMMDD');
  INSERT INTO public.bookings(reference,room_id,property_id,check_in,check_out,nights,adults,children,
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,special_requests,currency,source)
  VALUES(_reference,_room.id,_property_id,_check_in,_check_out,_nights,_adults,_children_total,
    _below6,_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,_special_requests,_room.currency,'website')
  RETURNING id INTO _booking_id;
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units) VALUES(_room.id,_d,_room.total_units)
      ON CONFLICT(room_id,date) DO NOTHING;
    SELECT i.available_units,i.is_blocked INTO _units,_blocked FROM public.room_inventory i
      WHERE i.room_id=_room.id AND i.date=_d FOR UPDATE;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    -- Active holds reserve inventory too. Exclude the caller's own validated hold.
    SELECT count(*) INTO _hold_count
      FROM public.booking_holds h
      WHERE h.room_id=_room.id AND h.status='active' AND h.expires_at>now()
        AND h.check_in<=_d AND h.check_out>_d
        AND (_hold_id IS NULL OR h.id<>_hold_id);
    IF _units-_hold_count<=0 THEN RAISE EXCEPTION 'No availability on %',_d; END IF;
    SELECT COALESCE(i.price_override,_room.base_price)+(_extra_occupants*_room.extra_guest_fee)
      INTO _rate FROM public.room_inventory i WHERE i.room_id=_room.id AND i.date=_d;
    UPDATE public.room_inventory SET available_units=GREATEST(available_units-1,0) WHERE room_id=_room.id AND date=_d;
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate) VALUES(_booking_id,_room.id,_d,_rate);
    _subtotal:=_subtotal+_rate; _d:=_d+1;
  END LOOP;
  IF jsonb_typeof(COALESCE(_extras,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'extras must be an array'; END IF;
  FOR _item IN SELECT e->>'slug' slug,COALESCE((e->>'quantity')::integer,1) quantity FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) e LOOP
    IF _item.quantity<1 THEN RAISE EXCEPTION 'Extra quantity must be positive'; END IF;
    SELECT e.* INTO _extra FROM public.extras e WHERE e.slug=_item.slug AND e.active AND e.property_id=_property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found for property: %',_item.slug; END IF;
    _line:=_extra.price*_item.quantity*CASE _extra.unit
      WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights WHEN 'per_person' THEN _occupants
      WHEN 'per_person_per_night' THEN _occupants*_nights ELSE 1 END;
    INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total)
      VALUES(_booking_id,_extra.id,_item.quantity,_extra.price,_line);
    _extras_total:=_extras_total+_line;
  END LOOP;
  _total:=_subtotal+_extras_total; _deposit:=round((_total/2)::numeric,2); _balance:=_total-_deposit;
  UPDATE public.bookings SET subtotal=_subtotal,extras_total=_extras_total,total=_total,
    deposit_amount=_deposit,balance_amount=_balance,balance_due=_balance WHERE id=_booking_id;
  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds SET status='converted',converted_booking_id=_booking_id,updated_at=now() WHERE id=_hold_id;
  END IF;
  PERFORM public.log_calendar_event('reservation.created',_room.id,_booking_id,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'reference',_reference,'total',_total));
  RETURN QUERY SELECT _booking_id,_reference,_total,_room.currency;
END $function$
;
COMMIT;
