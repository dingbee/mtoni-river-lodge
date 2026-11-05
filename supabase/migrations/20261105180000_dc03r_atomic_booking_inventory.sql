-- DC-03R: one row-locking invariant for every public hold and booking allocation.
-- Property identifiers are resolved server-side by the public booking allowlist;
-- no RPC below resolves a property from request hostnames or browser-supplied scope.

CREATE INDEX IF NOT EXISTS booking_holds_room_active_expiry_dates_idx
  ON public.booking_holds(room_id,expires_at,check_in,check_out)
  WHERE status='active';

CREATE OR REPLACE FUNCTION public.staynas_lock_room_inventory_dates(
  _room_id uuid,_property_id uuid,_check_in date,_check_out date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE _d date; _room public.rooms%ROWTYPE;
BEGIN
  IF _room_id IS NULL OR _property_id IS NULL OR _check_in IS NULL
     OR _check_out IS NULL OR _check_out<=_check_in THEN
    RAISE EXCEPTION 'Invalid inventory lock request' USING ERRCODE='22023';
  END IF;
  SELECT r.* INTO _room FROM public.rooms r
  WHERE r.id=_room_id AND r.property_id=_property_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room/property mismatch' USING ERRCODE='42501'; END IF;
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(_room.id,_d,_room.total_units)
    ON CONFLICT(room_id,date) DO NOTHING;
    PERFORM 1 FROM public.room_inventory i
    WHERE i.room_id=_room.id AND i.date=_d FOR UPDATE;
    _d:=_d+1;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.staynas_lock_room_inventory_dates(uuid,uuid,date,date)
  FROM PUBLIC,anon,authenticated,service_role;

-- Canonical booking RPC. All dates are locked in ascending order before the
-- hold row; the exact converted hold alone is excluded from the hold count.
-- The payment method is optional so existing 16-argument named RPC calls remain
-- compatible while using the tax-aware booking calculation.
DROP FUNCTION IF EXISTS public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid);
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text,_check_in date,_check_out date,_adults integer,_children integer,
  _guest_name text,_guest_email text,_guest_phone text,_country text,_special_requests text,
  _extras jsonb,_children_below_6 integer,_children_7_plus integer,
  _hold_id uuid,_session_id text,_property_id uuid,_payment_method text DEFAULT 'online'
) RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text,taxes numeric,tax_addition numeric,tax_breakdown jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE
  _room public.rooms%ROWTYPE; _hold public.booking_holds%ROWTYPE;
  _extra public.extras%ROWTYPE; _item record; _d date;
  _nights integer; _units integer; _blocked boolean; _hold_count integer;
  _rate numeric; _subtotal numeric:=0; _extras_total numeric:=0;
  _total numeric:=0; _deposit numeric:=0; _balance numeric:=0;
  _reference text; _booking_id uuid; _line numeric;
  _below6 integer:=COALESCE(_children_below_6,0);
  _plus7 integer:=COALESCE(_children_7_plus,GREATEST(0,COALESCE(_children,0)));
  _children_total integer; _occupants integer; _paid_occupants integer;
  _extra_occupants integer; _tax jsonb; _tax_total numeric:=0; _tax_addition numeric:=0;
  _jwt_role text:=COALESCE(
    NULLIF(current_setting('request.jwt.claim.role',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'');
  _prior_finance_rpc text;
BEGIN
  IF _property_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active'
  ) THEN RAISE EXCEPTION 'Property is required and must be active' USING ERRCODE='42501'; END IF;
  IF _jwt_role<>'service_role' AND (
    auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(),_property_id)
  ) THEN RAISE EXCEPTION 'Not authorized for requested property' USING ERRCODE='42501'; END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults<1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Valid email required';
  END IF;
  IF jsonb_typeof(COALESCE(_extras,'[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'extras must be an array';
  END IF;
  IF COALESCE(_payment_method,'online') NOT IN ('online','pay_at_property') THEN
    RAISE EXCEPTION 'Unsupported booking payment method';
  END IF;

  SELECT r.* INTO _room FROM public.rooms r
  WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;
  _children_total:=_below6+_plus7; _occupants:=_adults+_children_total;
  IF _occupants>_room.max_occupancy THEN RAISE EXCEPTION 'Room occupancy exceeded'; END IF;
  _paid_occupants:=_adults+_plus7;
  _extra_occupants:=GREATEST(0,_paid_occupants-_room.included_guests);
  _nights:=_check_out-_check_in;

  PERFORM public.staynas_lock_room_inventory_dates(_room.id,_property_id,_check_in,_check_out);

  IF _hold_id IS NOT NULL THEN
    SELECT h.* INTO _hold FROM public.booking_holds h WHERE h.id=_hold_id FOR UPDATE;
    IF NOT FOUND OR _hold.status<>'active' OR _hold.expires_at<=now() THEN
      RAISE EXCEPTION 'Booking hold is not active';
    END IF;
    IF _hold.property_id<>_property_id OR _hold.room_id<>_room.id
       OR _hold.check_in<>_check_in OR _hold.check_out<>_check_out THEN
      RAISE EXCEPTION 'Hold property, room or dates do not match booking';
    END IF;
    IF _session_id IS NULL OR length(trim(_session_id))<24 OR _hold.session_id<>_session_id THEN
      RAISE EXCEPTION 'Hold session mismatch' USING ERRCODE='42501';
    END IF;
  END IF;

  _reference:='MR-'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(random()::text),1,5));
  INSERT INTO public.bookings(
    reference,room_id,property_id,check_in,check_out,nights,adults,children,
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,
    special_requests,currency,source,payment_method,payment_provider
  ) VALUES(
    _reference,_room.id,_property_id,_check_in,_check_out,_nights,_adults,_children_total,
    _below6,_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,
    _special_requests,_room.currency,'website',
    CASE WHEN _payment_method='pay_at_property' THEN 'pay_at_property' ELSE NULL END,
    CASE WHEN _payment_method='pay_at_property' THEN 'manual' ELSE 'pesapal' END
  ) RETURNING id INTO _booking_id;

  _d:=_check_in;
  WHILE _d<_check_out LOOP
    SELECT i.available_units,i.is_blocked,
      COALESCE(i.price_override,_room.base_price)+(_extra_occupants*_room.extra_guest_fee)
    INTO _units,_blocked,_rate
    FROM public.room_inventory i WHERE i.room_id=_room.id AND i.date=_d;
    SELECT count(*) INTO _hold_count
    FROM public.booking_holds h
    WHERE h.room_id=_room.id AND h.property_id=_property_id
      AND h.status='active' AND h.expires_at>now()
      AND h.check_in<=_d AND h.check_out>_d
      AND h.id IS DISTINCT FROM _hold_id;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    IF _units-_hold_count<1 THEN RAISE EXCEPTION 'No unallocated inventory on %',_d; END IF;
    UPDATE public.room_inventory SET available_units=available_units-1,updated_at=now()
    WHERE room_id=_room.id AND date=_d AND available_units>0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed while allocating %',_d; END IF;
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate)
    VALUES(_booking_id,_room.id,_d,_rate);
    _subtotal:=_subtotal+_rate; _d:=_d+1;
  END LOOP;

  FOR _item IN
    SELECT e->>'slug' AS slug,COALESCE((e->>'quantity')::integer,1) AS quantity
    FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) e
  LOOP
    IF _item.quantity<1 THEN RAISE EXCEPTION 'Extra quantity must be positive'; END IF;
    SELECT e.* INTO _extra FROM public.extras e
    WHERE e.slug=_item.slug AND e.active=true AND e.property_id=_property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found for property: %',_item.slug; END IF;
    IF _extra.currency IS NOT NULL AND upper(_extra.currency)<>upper(_room.currency) THEN
      RAISE EXCEPTION 'Extra currency does not match room currency';
    END IF;
    _line:=_extra.price*_item.quantity*CASE _extra.unit
      WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights
      WHEN 'per_person' THEN _occupants WHEN 'per_person_per_night' THEN _occupants*_nights
      ELSE 1 END;
    INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total)
    VALUES(_booking_id,_extra.id,_item.quantity,_extra.price,_line);
    _extras_total:=_extras_total+_line;
  END LOOP;

  _tax:=public.calculate_staynas_booking_taxes(
    _property_id,_check_in,_nights,_subtotal,_extras_total,_room.currency
  );
  _tax_total:=COALESCE((_tax->>'tax_total')::numeric,0);
  _tax_addition:=COALESCE((_tax->>'tax_addition')::numeric,0);
  _total:=_subtotal+_extras_total+_tax_addition;
  _deposit:=CASE WHEN _payment_method='pay_at_property' THEN 0 ELSE round((_total/2)::numeric,2) END;
  _balance:=_total-_deposit;
  _prior_finance_rpc:=current_setting('staynas.payment_rpc',true);
  PERFORM set_config('staynas.payment_rpc','on',true);
  UPDATE public.bookings SET subtotal=_subtotal,extras_total=_extras_total,taxes=_tax_total,
    tax_addition=_tax_addition,tax_breakdown=COALESCE(_tax->'breakdown','[]'::jsonb),
    total=_total,deposit_amount=_deposit,balance_amount=_balance,balance_due=_balance
  WHERE id=_booking_id;
  PERFORM set_config('staynas.payment_rpc',COALESCE(_prior_finance_rpc,''),true);

  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds SET status='converted',converted_booking_id=_booking_id,updated_at=now()
    WHERE id=_hold_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking hold could not be converted'; END IF;
  END IF;
  PERFORM public.log_calendar_event(
    'reservation.created',_room.id,_booking_id,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'reference',_reference,'total',_total)
  );
  RETURN QUERY SELECT _booking_id,_reference,_total,_room.currency,
    _tax_total,_tax_addition,COALESCE(_tax->'breakdown','[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid,text)
  TO authenticated,service_role;

-- The older public property-first overloads are retired from guest/authenticated
-- execution. The server uses create_booking above; no client may assert property scope.
REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_booking_hold(
  _room_slug text,_check_in date,_check_out date,_session_id text,
  _property_id uuid,_guest_email text DEFAULT NULL,_ttl_seconds integer DEFAULT 900
) RETURNS TABLE(hold_id uuid,expires_at timestamptz,room_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE
  _room public.rooms%ROWTYPE; _d date; _units integer; _blocked boolean;
  _hold_count integer; _hold_id uuid; _expires_at timestamptz;
  _jwt_role text:=COALESCE(
    NULLIF(current_setting('request.jwt.claim.role',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'');
BEGIN
  IF _property_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active'
  ) THEN RAISE EXCEPTION 'Property not found or inactive' USING ERRCODE='42501'; END IF;
  IF _jwt_role<>'service_role' AND (
    auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(),_property_id)
  ) THEN RAISE EXCEPTION 'Not authorized for requested property' USING ERRCODE='42501'; END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _session_id IS NULL OR length(trim(_session_id))<24 THEN
    RAISE EXCEPTION 'A high-entropy session token is required' USING ERRCODE='22023';
  END IF;
  IF _ttl_seconds IS NULL OR _ttl_seconds NOT BETWEEN 60 AND 3600 THEN _ttl_seconds:=900; END IF;
  SELECT r.* INTO _room FROM public.rooms r
  WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;

  PERFORM public.staynas_lock_room_inventory_dates(_room.id,_property_id,_check_in,_check_out);
  _d:=_check_in;
  WHILE _d<_check_out LOOP
    SELECT i.available_units,i.is_blocked INTO _units,_blocked
    FROM public.room_inventory i WHERE i.room_id=_room.id AND i.date=_d;
    SELECT count(*) INTO _hold_count FROM public.booking_holds h
    WHERE h.room_id=_room.id AND h.property_id=_property_id
      AND h.status='active' AND h.expires_at>now()
      AND h.check_in<=_d AND h.check_out>_d;
    IF _blocked THEN RAISE EXCEPTION 'Room blocked on %',_d; END IF;
    IF _units-_hold_count<1 THEN RAISE EXCEPTION 'No availability on %',_d; END IF;
    _d:=_d+1;
  END LOOP;

  _expires_at:=now()+make_interval(secs=>_ttl_seconds);
  INSERT INTO public.booking_holds(room_id,property_id,check_in,check_out,session_id,guest_email,expires_at)
  VALUES(_room.id,_property_id,_check_in,_check_out,_session_id,NULLIF(lower(trim(_guest_email)),''),_expires_at)
  RETURNING id INTO _hold_id;
  PERFORM public.log_calendar_event(
    'hold.created',_room.id,NULL,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'ttl_seconds',_ttl_seconds)
  );
  RETURN QUERY SELECT _hold_id,_expires_at,_room.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_booking_hold(text,date,date,text,uuid,text,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_booking_hold(text,date,date,text,uuid,text,integer)
  TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.release_booking_hold(
  _hold_id uuid,_session_id text,_property_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE _row public.booking_holds%ROWTYPE;
  _jwt_role text:=COALESCE(
    NULLIF(current_setting('request.jwt.claim.role',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'');
BEGIN
  SELECT h.* INTO _row FROM public.booking_holds h
  WHERE h.id=_hold_id AND h.property_id=_property_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.staynas_lock_room_inventory_dates(_row.room_id,_property_id,_row.check_in,_row.check_out);
  SELECT h.* INTO _row FROM public.booking_holds h
  WHERE h.id=_hold_id AND h.property_id=_property_id FOR UPDATE;
  IF NOT FOUND OR _row.status<>'active' THEN RETURN false; END IF;
  IF _jwt_role='service_role' THEN
    IF _session_id IS NULL OR _row.session_id<>_session_id THEN
      RAISE EXCEPTION 'Hold session mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
    IF _row.session_id<>_session_id
       AND NOT public.staynas_user_has_property_access(auth.uid(),_property_id) THEN
      RAISE EXCEPTION 'Not authorized to release this hold' USING ERRCODE='42501';
    END IF;
  END IF;
  UPDATE public.booking_holds SET status='released',updated_at=now()
  WHERE id=_hold_id AND status='active';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.log_calendar_event(
    'hold.released',_row.room_id,NULL,_row.id,_row.check_in,_row.check_out,
    jsonb_build_object('property_id',_property_id)
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_booking_hold(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_booking_hold(uuid,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_booking_hold_for_session(
  _hold_id uuid,_session_id text,_property_id uuid
) RETURNS TABLE(id uuid,room_id uuid,check_in date,check_out date,expires_at timestamptz,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $function$
  SELECT h.id,h.room_id,h.check_in,h.check_out,h.expires_at,h.status::text
  FROM public.booking_holds h
  WHERE h.id=_hold_id AND h.property_id=_property_id
    AND _session_id IS NOT NULL AND length(trim(_session_id))>=24
    AND h.session_id=_session_id
$function$;

REVOKE ALL ON FUNCTION public.get_booking_hold_for_session(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_booking_hold_for_session(uuid,text,uuid) TO authenticated,service_role;

-- Remove unscoped hold RPCs that embed a single property UUID.
DROP FUNCTION IF EXISTS public.create_booking_hold(text,date,date,text,text,integer);
DROP FUNCTION IF EXISTS public.release_booking_hold(uuid,text);
DROP FUNCTION IF EXISTS public.get_booking_hold_for_session(uuid,text);

-- Retire the legacy property-first guest RPCs. They accepted browser-selectable
-- property IDs and did not share the canonical inventory allocator.
DROP FUNCTION IF EXISTS public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text);
DROP FUNCTION IF EXISTS public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text);
DROP FUNCTION IF EXISTS public.create_booking_hold_for_property(uuid,text,date,date,text,text,integer);

NOTIFY pgrst, 'reload schema';
