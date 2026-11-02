-- SN-BOOK-06: Property-scoped tax calculation and booking total reconciliation.
-- Review artifact only. Apply through the approved migration workflow after CI and review.
CREATE OR REPLACE FUNCTION public.calculate_staynas_booking_taxes(
  _property_id uuid,
  _service_date date,
  _nights integer,
  _accommodation_subtotal numeric,
  _extras_total numeric,
  _currency text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_base numeric;
  v_scope_base numeric;
  v_tax numeric;
  v_added numeric;
  v_tax_total numeric := 0;
  v_tax_addition numeric := 0;
  v_accommodation_tax numeric := 0;
  v_extras_tax numeric := 0;
  v_all_tax numeric := 0;
  v_breakdown jsonb := '[]'::jsonb;
BEGIN
  IF _property_id IS NULL OR _service_date IS NULL OR _nights IS NULL OR _nights < 1 THEN
    RAISE EXCEPTION 'Valid property, service date and night count are required';
  END IF;
  IF _accommodation_subtotal IS NULL OR _accommodation_subtotal < 0 OR _extras_total IS NULL OR _extras_total < 0 THEN
    RAISE EXCEPTION 'Taxable amounts must be non-negative';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property not found or inactive';
  END IF;

  FOR r IN
    SELECT * FROM public.staynas_property_tax_rules t
    WHERE t.property_id=_property_id
      AND t.active=true
      AND (t.valid_from IS NULL OR t.valid_from<=_service_date)
      AND (t.valid_to IS NULL OR t.valid_to>=_service_date)
      AND (
        (t.calculation_type IN ('inclusive_percent','exclusive_percent') AND (t.currency IS NULL OR upper(t.currency)=upper(_currency)))
        OR (t.calculation_type IN ('fixed_per_night','fixed_per_booking') AND upper(t.currency)=upper(_currency))
      )
    ORDER BY t.created_at, t.id
  LOOP
    v_scope_base := CASE r.applies_to
      WHEN 'accommodation' THEN _accommodation_subtotal
      WHEN 'extras' THEN _extras_total
      ELSE _accommodation_subtotal + _extras_total
    END;
    v_base := v_scope_base;
    IF r.is_compound AND v_scope_base > 0 THEN
      v_base := v_base + CASE r.applies_to
        WHEN 'accommodation' THEN v_accommodation_tax + v_all_tax
        WHEN 'extras' THEN v_extras_tax + v_all_tax
        ELSE v_tax_addition
      END;
    END IF;

    v_tax := CASE WHEN v_scope_base <= 0 THEN 0 ELSE
      CASE r.calculation_type
        WHEN 'inclusive_percent' THEN
          CASE WHEN COALESCE(r.rate,0)=0 THEN 0 ELSE round(v_base - (v_base / (1 + (r.rate / 100))), 2) END
        WHEN 'exclusive_percent' THEN round(v_base * r.rate / 100, 2)
        WHEN 'fixed_per_night' THEN round(r.rate * _nights, 2)
        WHEN 'fixed_per_booking' THEN round(r.rate, 2)
        ELSE 0
      END
    END;
    v_added := CASE WHEN r.calculation_type='inclusive_percent' THEN 0 ELSE v_tax END;
    v_tax_total := v_tax_total + v_tax;
    v_tax_addition := v_tax_addition + v_added;
    IF r.applies_to='accommodation' THEN
      v_accommodation_tax := v_accommodation_tax + v_added;
    ELSIF r.applies_to='extras' THEN
      v_extras_tax := v_extras_tax + v_added;
    ELSE
      v_all_tax := v_all_tax + v_added;
    END IF;
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'name', r.name,
      'code', r.tax_code,
      'applies_to', r.applies_to,
      'calculation_type', r.calculation_type,
      'rate', r.rate,
      'currency', COALESCE(r.currency, upper(_currency)),
      'amount', round(v_tax,2),
      'inclusive', r.calculation_type='inclusive_percent',
      'added_to_total', round(v_added,2),
      'compound', r.is_compound
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'tax_total', round(v_tax_total,2),
    'tax_addition', round(v_tax_addition,2),
    'configured', jsonb_array_length(v_breakdown)>0,
    'breakdown', v_breakdown
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_staynas_booking_taxes(uuid,date,integer,numeric,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_staynas_booking_taxes(uuid,date,integer,numeric,numeric,text) TO service_role;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tax_addition numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;


DROP FUNCTION IF EXISTS public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text);
CREATE OR REPLACE FUNCTION public.create_booking_for_property(_property_id uuid, _room_slug text, _check_in date, _check_out date, _adults integer, _children integer, _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text, _extras jsonb DEFAULT '[]'::jsonb, _children_below_6 integer DEFAULT NULL::integer, _children_7_plus integer DEFAULT NULL::integer, _hold_id uuid DEFAULT NULL::uuid, _session_id text DEFAULT NULL::text, _payment_method text DEFAULT 'online'::text)
 RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text, taxes numeric, tax_addition numeric, tax_breakdown jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.rooms%ROWTYPE; _hold public.booking_holds%ROWTYPE; _extra public.extras%ROWTYPE;
  _item record; _d date; _nights integer; _units integer; _blocked boolean; _rate numeric;
  _subtotal numeric:=0; _extras_total numeric:=0; _total numeric:=0; _deposit numeric:=0; _balance numeric:=0;
  _reference text; _booking_id uuid; _below6 integer:=COALESCE(_children_below_6,0);
  _plus7 integer:=COALESCE(_children_7_plus,GREATEST(0,COALESCE(_children,0)));
  _children_total integer; _occupants integer; _paid_occupants integer; _extra_occupants integer; _line numeric; _tax jsonb; _tax_total numeric:=0; _tax_addition numeric:=0;
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
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,special_requests,currency,source,payment_method,payment_provider)
  VALUES(_reference,_room.id,_property_id,_check_in,_check_out,_nights,_adults,_children_total,
    _below6,_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,_special_requests,_room.currency,'website',CASE WHEN _payment_method='pay_at_property' THEN 'pay_at_property' ELSE NULL END,CASE WHEN _payment_method='pay_at_property' THEN 'manual' ELSE 'pesapal' END)
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
    IF _extra.currency IS NOT NULL AND upper(_extra.currency)<>upper(_room.currency) THEN
      RAISE EXCEPTION 'Extra currency % does not match room currency %',_extra.currency,_room.currency;
    END IF;
    _line:=_extra.price*_item.quantity*CASE _extra.unit
      WHEN 'per_stay' THEN 1 WHEN 'per_night' THEN _nights WHEN 'per_person' THEN _occupants
      WHEN 'per_person_per_night' THEN _occupants*_nights ELSE 1 END;
    INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total)
      VALUES(_booking_id,_extra.id,_item.quantity,_extra.price,_line);
    _extras_total:=_extras_total+_line;
  END LOOP;
  IF COALESCE(_payment_method,'online') NOT IN ('online','pay_at_property') THEN RAISE EXCEPTION 'Unsupported booking payment method'; END IF;
  _tax := public.calculate_staynas_booking_taxes(_property_id,_check_in,_nights,_subtotal,_extras_total,_room.currency);
  _tax_total := COALESCE((_tax->>'tax_total')::numeric,0);
  _tax_addition := COALESCE((_tax->>'tax_addition')::numeric,0);
  _total:=_subtotal+_extras_total+_tax_addition;
  _deposit:=CASE WHEN _payment_method='pay_at_property' THEN 0 ELSE round((_total/2)::numeric,2) END;
  _balance:=_total-_deposit;
  UPDATE public.bookings SET subtotal=_subtotal,extras_total=_extras_total,taxes=_tax_total,
    tax_addition=_tax_addition,tax_breakdown=COALESCE(_tax->'breakdown','[]'::jsonb),total=_total,
    deposit_amount=_deposit,balance_amount=_balance,balance_due=_balance WHERE id=_booking_id;
  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds SET status='converted',converted_booking_id=_booking_id,updated_at=now() WHERE id=_hold_id;
  END IF;
  PERFORM public.log_calendar_event('reservation.created',_room.id,_booking_id,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'reference',_reference,'total',_total));
  RETURN QUERY SELECT _booking_id,_reference,_total,_room.currency,_tax_total,_tax_addition,COALESCE(_tax->'breakdown','[]'::jsonb);
END $function$
;
REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text) TO anon, authenticated, service_role;
