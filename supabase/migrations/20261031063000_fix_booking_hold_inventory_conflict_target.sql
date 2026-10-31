-- Fix PL/pgSQL output-column ambiguity in property-scoped booking holds.
-- Use the named unique constraint so the RETURNS TABLE room_id output variable
-- cannot shadow the conflict target columns.
CREATE OR REPLACE FUNCTION public.create_booking_hold_for_property(
  _property_id uuid, _room_slug text, _check_in date, _check_out date,
  _session_id text, _guest_email text DEFAULT NULL::text, _ttl_seconds integer DEFAULT 900
)
RETURNS TABLE(hold_id uuid, expires_at timestamp with time zone, room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _room public.rooms%ROWTYPE;
  _d date;
  _units integer;
  _blocked boolean;
  _hold_count integer;
  _hold_id uuid;
  _expires_at timestamptz;
BEGIN
  IF _property_id IS NULL THEN RAISE EXCEPTION 'property_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property not found or inactive';
  END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _session_id IS NULL OR length(trim(_session_id))<6 THEN RAISE EXCEPTION 'session_id required'; END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds<60 OR _ttl_seconds>3600 THEN _ttl_seconds:=900; END IF;

  SELECT * INTO _room FROM public.rooms r
  WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;

  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(_room.id,_d,_room.total_units)
    ON CONFLICT ON CONSTRAINT room_inventory_pkey DO NOTHING;

    SELECT i.available_units,i.is_blocked INTO _units,_blocked
    FROM public.room_inventory i
    WHERE i.room_id=_room.id AND i.date=_d
    FOR UPDATE;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;

    SELECT count(*) INTO _hold_count
    FROM public.booking_holds h
    WHERE h.room_id=_room.id AND h.status='active'
      AND h.expires_at>now() AND h.session_id<>_session_id
      AND h.check_in<=_d AND h.check_out>_d;
    IF _units-_hold_count<=0 THEN RAISE EXCEPTION 'No availability on %',_d; END IF;
    _d:=_d+1;
  END LOOP;

  _expires_at:=now()+make_interval(secs=>_ttl_seconds);
  UPDATE public.booking_holds h SET status='released',updated_at=now()
  FROM public.rooms r
  WHERE r.id=h.room_id AND r.property_id=_property_id
    AND h.session_id=_session_id AND h.status='active';

  INSERT INTO public.booking_holds(room_id,check_in,check_out,session_id,guest_email,expires_at)
  VALUES(_room.id,_check_in,_check_out,_session_id,NULLIF(lower(trim(_guest_email)),''),
    _expires_at)
  RETURNING id INTO _hold_id;

  PERFORM public.log_calendar_event('hold.created',_room.id,NULL,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'session_id',_session_id,'ttl_seconds',_ttl_seconds));

  RETURN QUERY SELECT _hold_id,_expires_at,_room.id;
END
$function$;
