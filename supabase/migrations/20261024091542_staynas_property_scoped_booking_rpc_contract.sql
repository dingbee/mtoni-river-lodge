-- Property-scoped StayNas booking contract.
-- New explicit-property RPCs are additive; legacy website RPCs remain temporarily
-- compatible until every client is migrated. No tenant is hard-coded.
CREATE OR REPLACE FUNCTION public.get_room_availability_for_property(
  _property_id uuid, _check_in date, _check_out date
)
RETURNS TABLE(room_id uuid, slug text, name text, base_price numeric, currency text,
 capacity_adults integer, capacity_children integer, max_occupancy integer,
 nights integer, nightly_total numeric, min_available integer, is_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE _nights integer;
BEGIN
  IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property not found or inactive';
  END IF;
  _nights := _check_out - _check_in;
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in, _check_out - interval '1 day', interval '1 day')::date d
  ), per_night AS (
    SELECT r.id room_id, dr.d, COALESCE(i.available_units,r.total_units) units,
      COALESCE(i.is_blocked,false) blocked, COALESCE(i.price_override,r.base_price) rate,
      (SELECT count(*) FROM public.booking_holds h WHERE h.room_id=r.id AND h.status='active'
        AND h.expires_at>now() AND h.check_in<=dr.d AND h.check_out>dr.d) hold_count
    FROM public.rooms r CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory i ON i.room_id=r.id AND i.date=dr.d
    WHERE r.status='active' AND r.property_id=_property_id
  )
  SELECT r.id,r.slug,r.name,r.base_price,r.currency,r.capacity_adults,r.capacity_children,r.max_occupancy,
    _nights,COALESCE(sum(pn.rate),0)::numeric,
    COALESCE(min(GREATEST(pn.units-pn.hold_count,0)),0)::integer,
    (count(*) FILTER (WHERE pn.blocked OR pn.units-pn.hold_count<=0)=0)
  FROM public.rooms r JOIN per_night pn ON pn.room_id=r.id
  WHERE r.status='active' AND r.property_id=_property_id
  GROUP BY r.id;
END $fn$;

CREATE OR REPLACE FUNCTION public.create_booking_for_property(
  _property_id uuid, _room_slug text, _check_in date, _check_out date,
  _adults integer, _children integer, _guest_name text, _guest_email text,
  _guest_phone text, _country text, _special_requests text, _extras jsonb DEFAULT '[]'::jsonb,
  _children_below_6 integer DEFAULT NULL, _children_7_plus integer DEFAULT NULL,
  _hold_id uuid DEFAULT NULL, _session_id text DEFAULT NULL
)
RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  _room public.rooms%ROWTYPE; _hold public.booking_holds%ROWTYPE; _extra public.extras%ROWTYPE;
  _item record; _d date; _nights integer; _units integer; _blocked boolean; _rate numeric;
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
    IF _units<=0 AND _hold_id IS NULL THEN RAISE EXCEPTION 'No availability on %',_d; END IF;
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
END $fn$;

CREATE OR REPLACE FUNCTION public.create_booking_hold_for_property(
  _property_id uuid, _room_slug text, _check_in date, _check_out date,
  _session_id text, _guest_email text DEFAULT NULL, _ttl_seconds integer DEFAULT 900
)
RETURNS TABLE(hold_id uuid, expires_at timestamptz, room_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE _room public.rooms%ROWTYPE; _d date; _units integer; _blocked boolean; _hold_count integer; _hold_id uuid; _expires_at timestamptz;
BEGIN
  IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN RAISE EXCEPTION 'Property not found or inactive'; END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _session_id IS NULL OR length(trim(_session_id))<6 THEN RAISE EXCEPTION 'session_id required'; END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds<60 OR _ttl_seconds>3600 THEN _ttl_seconds:=900; END IF;
  SELECT * INTO _room FROM public.rooms r WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units) VALUES(_room.id,_d,_room.total_units) ON CONFLICT(room_id,date) DO NOTHING;
    SELECT i.available_units,i.is_blocked INTO _units,_blocked FROM public.room_inventory i WHERE i.room_id=_room.id AND i.date=_d FOR UPDATE;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    SELECT count(*) INTO _hold_count FROM public.booking_holds h WHERE h.room_id=_room.id AND h.status='active'
      AND h.expires_at>now() AND h.session_id<>_session_id AND h.check_in<=_d AND h.check_out>_d;
    IF _units-_hold_count<=0 THEN RAISE EXCEPTION 'No availability on %',_d; END IF;
    _d:=_d+1;
  END LOOP;
  _expires_at:=now()+make_interval(secs=>_ttl_seconds);
  UPDATE public.booking_holds h SET status='released',updated_at=now()
    FROM public.rooms r WHERE r.id=h.room_id AND r.property_id=_property_id
      AND h.session_id=_session_id AND h.status='active';
  INSERT INTO public.booking_holds(room_id,check_in,check_out,session_id,guest_email,expires_at)
    VALUES(_room.id,_check_in,_check_out,_session_id,NULLIF(lower(trim(_guest_email)),''),_expires_at)
    RETURNING id INTO _hold_id;
  PERFORM public.log_calendar_event('hold.created',_room.id,NULL,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'session_id',_session_id,'ttl_seconds',_ttl_seconds));
  RETURN QUERY SELECT _hold_id,_expires_at,_room.id;
END $fn$;

CREATE OR REPLACE FUNCTION public.release_booking_hold_for_property(_property_id uuid,_hold_id uuid,_session_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE _h public.booking_holds%ROWTYPE;
BEGIN
 IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
 SELECT h.* INTO _h FROM public.booking_holds h JOIN public.rooms r ON r.id=h.room_id
 WHERE h.id=_hold_id AND r.property_id=_property_id FOR UPDATE OF h;
 IF NOT FOUND OR _h.status<>'active' THEN RETURN false; END IF;
 IF _session_id IS NULL OR (_h.session_id<>_session_id AND NOT public.is_any_staff(auth.uid())) THEN
   RAISE EXCEPTION 'Not authorized to release this hold';
 END IF;
 UPDATE public.booking_holds SET status='released',updated_at=now() WHERE id=_hold_id;
 PERFORM public.log_calendar_event('hold.released',_h.room_id,NULL,_h.id,_h.check_in,_h.check_out,jsonb_build_object('property_id',_property_id));
 RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_booking_hold_for_property(_property_id uuid,_hold_id uuid,_session_id text)
RETURNS TABLE(id uuid,room_id uuid,check_in date,check_out date,expires_at timestamptz,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $fn$
 SELECT h.id,h.room_id,h.check_in,h.check_out,h.expires_at,h.status::text
 FROM public.booking_holds h JOIN public.rooms r ON r.id=h.room_id
 WHERE _property_id IS NOT NULL AND r.property_id=_property_id AND h.id=_hold_id
   AND _session_id IS NOT NULL AND length(trim(_session_id))>=6 AND h.session_id=_session_id
$fn$;

REVOKE ALL ON FUNCTION public.get_room_availability_for_property(uuid,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_hold_for_property(uuid,text,date,date,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_booking_hold_for_property(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_hold_for_property(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_availability_for_property(uuid,date,date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_hold_for_property(uuid,text,date,date,text,text,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_booking_hold_for_property(uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_hold_for_property(uuid,uuid,text) TO anon, authenticated;
