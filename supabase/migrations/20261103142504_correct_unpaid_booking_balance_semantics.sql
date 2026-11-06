-- Tenant-aware reservation creation. No tenant is inferred from a hard-coded property.
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text, _check_in date, _check_out date, _adults integer, _children integer,
  _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text,
  _extras jsonb, _children_below_6 integer, _children_7_plus integer, _hold_id uuid,
  _session_id text, _property_id uuid
)
RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _room public.rooms%ROWTYPE;
  _nights int; _subtotal numeric := 0; _extras_total numeric := 0;
  _total numeric := 0; _deposit numeric := 0; _balance numeric := 0;
  _reference text; _booking_id uuid; _d date; _rate numeric; _units int; _blocked boolean;
  _extra_row record; _extra public.extras%ROWTYPE; _line numeric;
  _below6 int := COALESCE(_children_below_6, 0);
  _plus7 int := COALESCE(_children_7_plus, GREATEST(0, COALESCE(_children,0)));
  _children_total int; _total_occupants int; _paid_occupants int; _extra_occupants int;
  _hold public.booking_holds%ROWTYPE;
  _jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults < 1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name)) < 2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  IF _property_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property is required and must be active';
  END IF;
  IF _jwt_role <> 'service_role' AND (auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(),_property_id)) THEN
    RAISE EXCEPTION 'Not authorized for requested property';
  END IF;
  SELECT * INTO _room FROM public.rooms WHERE slug=_room_slug AND status='active' AND property_id=_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for selected property: %',_room_slug; END IF;
  _children_total:=_below6+_plus7; _total_occupants:=_adults+_children_total;
  IF _total_occupants<1 THEN RAISE EXCEPTION 'At least one occupant required'; END IF;
  IF _total_occupants>_room.max_occupancy THEN RAISE EXCEPTION 'Room % allows up to % occupants',_room.name,_room.max_occupancy; END IF;
  _paid_occupants:=_adults+_plus7; _nights:=_check_out-_check_in;
  _extra_occupants:=GREATEST(0,_paid_occupants-_room.included_guests);
  IF _hold_id IS NOT NULL THEN
    SELECT * INTO _hold FROM public.booking_holds WHERE id=_hold_id FOR UPDATE;
    IF NOT FOUND OR _hold.status<>'active' OR _hold.expires_at<=now() THEN RAISE EXCEPTION 'Booking hold is not active'; END IF;
    IF _hold.room_id<>_room.id THEN RAISE EXCEPTION 'Hold room mismatch'; END IF;
    IF _session_id IS NOT NULL AND _hold.session_id<>_session_id THEN RAISE EXCEPTION 'Hold session mismatch'; END IF;
  END IF;
  _reference:='MR-'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(random()::text),1,5));
  INSERT INTO public.bookings(reference,room_id,check_in,check_out,nights,adults,children,children_below_6,children_7_plus,
    guest_name,guest_email,guest_phone,country,special_requests,currency,source,property_id)
  VALUES(_reference,_room.id,_check_in,_check_out,_nights,_adults,_children_total,_below6,_plus7,
    trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,_special_requests,_room.currency,'website',_property_id)
  RETURNING id INTO _booking_id;
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units) VALUES(_room.id,_d,_room.total_units) ON CONFLICT(room_id,date) DO NOTHING;
    SELECT available_units,is_blocked INTO _units,_blocked FROM public.room_inventory WHERE room_id=_room.id AND date=_d FOR UPDATE;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    IF _units<=0 AND _hold_id IS NULL THEN RAISE EXCEPTION 'No availability for % on %',_room.name,_d; END IF;
    SELECT COALESCE(price_override,_room.base_price)+(_extra_occupants*_room.extra_guest_fee) INTO _rate
      FROM public.room_inventory WHERE room_id=_room.id AND date=_d;
    UPDATE public.room_inventory SET available_units=GREATEST(available_units-1,0) WHERE room_id=_room.id AND date=_d;
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate) VALUES(_booking_id,_room.id,_d,_rate);
    _subtotal:=_subtotal+_rate; _d:=_d+INTERVAL '1 day';
  END LOOP;
  IF jsonb_array_length(COALESCE(_extras,'[]'::jsonb))>0 THEN
    FOR _extra_row IN SELECT (e->>'slug') slug,COALESCE((e->>'quantity')::int,1) quantity FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) e LOOP
      SELECT * INTO _extra FROM public.extras WHERE slug=_extra_row.slug AND active=true AND property_id=_property_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found for selected property: %',_extra_row.slug; END IF;
      _line:=_extra.price*_extra_row.quantity*CASE _extra.unit
        WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights WHEN 'per_person' THEN _total_occupants
        WHEN 'per_person_per_night' THEN _total_occupants*_nights ELSE 1 END;
      INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total) VALUES(_booking_id,_extra.id,_extra_row.quantity,_extra.price,_line);
      _extras_total:=_extras_total+_line;
    END LOOP;
  END IF;
  _total:=_subtotal+_extras_total; _deposit:=ROUND((_total/2.0)::numeric,2); _balance:=_total; -- Deposit is required, not received; unpaid bookings owe the full total.
  UPDATE public.bookings SET subtotal=_subtotal,extras_total=_extras_total,total=_total,deposit_amount=_deposit,balance_amount=_balance,balance_due=_balance WHERE id=_booking_id;
  IF _hold_id IS NOT NULL THEN UPDATE public.booking_holds SET status='converted',converted_booking_id=_booking_id,updated_at=now() WHERE id=_hold_id; END IF;
  PERFORM public.log_calendar_event('reservation.created',_room.id,_booking_id,_hold_id,_check_in,_check_out,jsonb_build_object('reference',_reference,'total',_total));
  RETURN QUERY SELECT _booking_id,_reference,_total,_room.currency;
END
$function$;
REVOKE ALL ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
