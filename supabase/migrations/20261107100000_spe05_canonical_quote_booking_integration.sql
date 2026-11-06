-- SPE-05 canonical integration: one quote engine for guest quote, availability and booking.
-- Additive financial columns; historical bookings remain unchanged.
BEGIN;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS fee_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.calculate_staynas_booking_quote(
  _property_id uuid,
  _room_id uuid,
  _check_in date,
  _check_out date,
  _adults integer,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0,
  _extras jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_quote jsonb;
  v_extra record;
  v_extra_row public.extras%ROWTYPE;
  v_quantity integer;
  v_line numeric;
  v_extras_total numeric := 0;
  v_extra_lines jsonb := '[]'::jsonb;
  v_adjustments jsonb;
  v_components jsonb := '[]'::jsonb;
  v_tax_addition numeric := 0;
  v_tax_total numeric := 0;
  v_fee_total numeric := 0;
  v_discount_total numeric := 0;
  v_promo_code text;
  v_guest_key text;
  v_rate_plan_id uuid;
  v_total numeric := 0;
  v_nights integer;
  v_occupants integer;
  v_currency text;
BEGIN
  IF jsonb_typeof(COALESCE(_extras,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Extras must be an array';
  END IF;
  v_room_quote := public.calculate_staynas_room_pricing(
    _property_id,_room_id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus
  );
  IF v_room_quote->>'ok'='false' THEN RETURN v_room_quote; END IF;
  v_nights := (v_room_quote->>'nights')::integer;
  v_occupants := (v_room_quote->>'occupants')::integer;
  v_currency := v_room_quote->>'currency';

  FOR v_extra IN
    SELECT e->>'slug' AS slug, COALESCE((e->>'quantity')::integer,1) AS quantity
    FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) e
  LOOP
    IF v_extra.slug IS NULL OR v_extra.quantity < 1 OR v_extra.quantity > 20 THEN
      RAISE EXCEPTION 'Invalid extra or quantity';
    END IF;
    SELECT * INTO v_extra_row
    FROM public.extras e
    WHERE e.slug = v_extra.slug AND e.active = true AND e.property_id = _property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found for property: %',v_extra.slug; END IF;
    IF v_extra_row.currency IS NOT NULL AND upper(v_extra_row.currency) <> v_currency THEN
      RAISE EXCEPTION 'Extra currency % does not match property currency %',v_extra_row.currency,v_currency;
    END IF;
    v_line := round(v_extra_row.price * v_extra.quantity * CASE v_extra_row.unit
      WHEN 'per_stay' THEN 1
      WHEN 'per_night' THEN v_nights
      WHEN 'per_person' THEN v_occupants
      WHEN 'per_person_per_night' THEN v_occupants * v_nights
      ELSE 1
    END,2);
    v_extras_total := round(v_extras_total + v_line,2);
    v_extra_lines := v_extra_lines || jsonb_build_array(jsonb_build_object(
      'slug',v_extra_row.slug,'name',v_extra_row.name,'quantity',v_extra.quantity,
      'unit_price',v_extra_row.price,'unit',v_extra_row.unit,'line_total',v_line,
      'currency',v_currency
    ));
  END LOOP;

  v_rate_plan_id := NULLIF(v_room_quote->'pricing_evidence'->>'rate_plan_id','')::uuid;
  v_promo_code := NULLIF(current_setting('staynas.promo_code',true),'');
  v_guest_key := NULLIF(current_setting('staynas.guest_key',true),'');
  v_components := jsonb_build_array(
    jsonb_build_object('component_type','accommodation',
      'amount',(v_room_quote->>'accommodation_subtotal')::numeric,'currency',v_currency),
    jsonb_build_object('component_type','guest_count','quantity',v_occupants)
  );
  SELECT v_components || COALESCE(jsonb_agg(jsonb_build_object(
    'component_type','extras','amount',(x->>'line_total')::numeric,'currency',v_currency
  )),'[]'::jsonb)
  INTO v_components
  FROM jsonb_array_elements(v_extra_lines) x;

  v_adjustments := public.calculate_staynas_spe05_adjustments(
    _property_id,_check_in,_check_out,v_currency,v_components,_room_id,v_rate_plan_id,
    v_promo_code,v_guest_key,(now() AT TIME ZONE (
      SELECT p.timezone FROM public.staynas_properties p WHERE p.id=_property_id
    ))::date
  );
  IF COALESCE((v_adjustments->>'ok')::boolean,false) IS NOT TRUE THEN
    RETURN v_adjustments;
  END IF;
  v_tax_total := COALESCE((v_adjustments->>'tax_total')::numeric,0);
  v_tax_addition := COALESCE((v_adjustments->>'tax_addition')::numeric,0);
  v_fee_total := COALESCE((v_adjustments->>'fee_total')::numeric,0);
  v_discount_total := COALESCE((v_adjustments->>'discount_total')::numeric,0);
  v_total := COALESCE((v_adjustments->>'total')::numeric,0);

  RETURN jsonb_build_object(
    'property_id',_property_id,'room_id',_room_id,'currency',v_currency,
    'check_in',_check_in,'check_out',_check_out,'nights',v_nights,
    'nightly',v_room_quote->'nightly',
    'pricing_evidence',v_room_quote->'pricing_evidence',
    'accommodation_subtotal',(v_room_quote->>'accommodation_subtotal')::numeric,
    'extras',v_extra_lines,'extras_total',v_extras_total,
    'taxes',v_tax_total,'tax_addition',v_tax_addition,
    'tax_breakdown',COALESCE(v_adjustments->'taxes','[]'::jsonb),
    'fees',COALESCE(v_adjustments->'fees','[]'::jsonb),'fee_total',v_fee_total,
    'discount_total',v_discount_total,'promotion',v_adjustments->'promotion',
    'pricing_engine_version','SPE-05.1',
    'total',v_total,'deposit_amount',round(v_total/2,2),
    'balance_due',v_total-round(v_total/2,2),
    'minimum_stay',(v_room_quote->>'minimum_stay')::integer,
    'occupants',(v_room_quote->>'occupants')::integer,
    'paid_occupants',(v_room_quote->>'paid_occupants')::integer,
    'extra_occupants',(v_room_quote->>'extra_occupants')::integer
  );
END;
$$;

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
  v_fee_total numeric := 0;
  v_discount_total numeric := 0;
  v_promotion jsonb;
  v_promotions jsonb := '[]'::jsonb;
  v_promo_line jsonb;
  v_redemption jsonb;
  v_guest_key text;
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

  v_guest_key := md5(lower(trim(_guest_email)));
  PERFORM set_config('staynas.guest_key',v_guest_key,true);
  v_quote := public.calculate_staynas_booking_quote(
    _property_id,v_room.id,_check_in,_check_out,_adults,v_below6,v_plus7,_extras
  );
  IF v_quote->>'ok'='false' THEN
    RAISE EXCEPTION 'StayNas pricing rejected [%]: %',v_quote->>'error_code',v_quote->>'message';
  END IF;
  v_room.currency := upper(v_room.currency);
  v_subtotal := (v_quote->>'accommodation_subtotal')::numeric;
  v_extras_total := (v_quote->>'extras_total')::numeric;
  v_taxes := (v_quote->>'taxes')::numeric;
  v_tax_addition := (v_quote->>'tax_addition')::numeric;
  v_tax_breakdown := COALESCE(v_quote->'tax_breakdown','[]'::jsonb);
  v_fee_total := COALESCE((v_quote->>'fee_total')::numeric,0);
  v_discount_total := COALESCE((v_quote->>'discount_total')::numeric,0);
  v_promotion := v_quote->'promotion';
  v_promotions := COALESCE(v_quote->'promotions','[]'::jsonb);
  v_total := (v_quote->>'total')::numeric;
  v_deposit := CASE WHEN v_payment_method='pay_at_property' THEN 0 ELSE round(v_total/2,2) END;
  v_balance := v_total-v_deposit;
  v_reference := upper(substr(md5(random()::text||clock_timestamp()::text),1,10)) || '-' || to_char(now(),'YYMMDD');

  INSERT INTO public.bookings(
    reference,room_id,property_id,check_in,check_out,nights,adults,children,
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,
    special_requests,currency,source,payment_method,payment_provider,
    subtotal,extras_total,fee_total,discount_total,taxes,tax_addition,tax_breakdown,total,deposit_amount,balance_amount,balance_due,
    pricing_snapshot
  )
  VALUES(
    v_reference,v_room.id,_property_id,_check_in,_check_out,v_nights,_adults,v_children_total,
    v_below6,v_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,
    _special_requests,v_room.currency,'website',
    CASE WHEN v_payment_method='pay_at_property' THEN 'pay_at_property' ELSE NULL END,
    CASE WHEN v_payment_method='pay_at_property' THEN 'manual' ELSE 'pesapal' END,
    v_subtotal,v_extras_total,v_fee_total,v_discount_total,v_taxes,v_tax_addition,v_tax_breakdown,v_total,v_deposit,v_balance,v_balance,
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
    VALUES(v_booking_id,v_room.id,v_day,(v_night->>'nightly_rate')::numeric,
      v_night || jsonb_build_object('pricing_adjustments',jsonb_build_object(
        'discount_total',v_discount_total,'fee_total',v_fee_total,'tax_total',v_taxes,
        'tax_addition',v_tax_addition,'promotion',v_promotion,'promotions',v_promotions,'currency',v_room.currency
      )));
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

  FOR v_promo_line IN SELECT value FROM jsonb_array_elements(v_promotions)
  LOOP
    v_redemption := public.redeem_staynas_promotion(
      _property_id,(v_promo_line->>'id')::uuid,v_booking_id,v_guest_key,
      (v_promo_line->>'discount_amount')::numeric,v_room.currency
    );
    IF COALESCE((v_redemption->>'ok')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Promotion redemption rejected [%]',COALESCE(v_redemption->>'error_code','REDEMPTION_FAILED');
    END IF;
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

-- Promotion-aware quote wrapper. Existing callers remain compatible; automatic
-- promotions continue to apply when no explicit code is provided.
CREATE OR REPLACE FUNCTION public.get_staynas_booking_quote_with_rate_plan_and_promo(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,_adults integer,
  _children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0,
  _extras jsonb DEFAULT '[]'::jsonb,_rate_plan_id uuid DEFAULT NULL,_promo_code text DEFAULT NULL,
  _guest_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $wrapper$
DECLARE v_room_id uuid;
BEGIN
  SELECT r.id INTO v_room_id FROM public.rooms r
  WHERE r.property_id=_property_id AND r.slug=_room_slug AND r.status='active';
  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error_code','ROOM_NOT_FOUND','message','Room not found for property');
  END IF;
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  PERFORM set_config('staynas.promo_code',COALESCE(_promo_code,''),true);
  PERFORM set_config('staynas.guest_key',CASE WHEN NULLIF(btrim(_guest_email),'') IS NULL
    THEN '' ELSE md5(lower(trim(_guest_email))) END,true);
  RETURN public.calculate_staynas_booking_quote(
    _property_id,v_room_id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus,_extras
  );
END;
$wrapper$;

REVOKE ALL ON FUNCTION public.get_staynas_booking_quote_with_rate_plan_and_promo(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_staynas_booking_quote_with_rate_plan_and_promo(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text)
  TO service_role;

-- Promotion-aware booking wrapper preserves the existing transactional booking RPC.
CREATE OR REPLACE FUNCTION public.create_booking_for_property_with_rate_plan_and_promo(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,_adults integer,_children integer,
  _guest_name text,_guest_email text,_guest_phone text,_country text,_special_requests text,
  _extras jsonb DEFAULT '[]'::jsonb,_children_below_6 integer DEFAULT NULL,
  _children_7_plus integer DEFAULT NULL,_hold_id uuid DEFAULT NULL,_session_id text DEFAULT NULL,
  _payment_method text DEFAULT 'online',_rate_plan_id uuid DEFAULT NULL,_promo_code text DEFAULT NULL
)
RETURNS TABLE(
  booking_id uuid,reference text,total numeric,currency text,taxes numeric,tax_addition numeric,tax_breakdown jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $booking_wrapper$
BEGIN
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  PERFORM set_config('staynas.promo_code',COALESCE(_promo_code,''),true);
  RETURN QUERY SELECT * FROM public.create_booking_for_property(
    _property_id,_room_slug,_check_in,_check_out,_adults,_children,_guest_name,_guest_email,
    _guest_phone,_country,_special_requests,_extras,_children_below_6,_children_7_plus,
    _hold_id,_session_id,_payment_method
  );
END;
$booking_wrapper$;

REVOKE ALL ON FUNCTION public.create_booking_for_property_with_rate_plan_and_promo(
  uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property_with_rate_plan_and_promo(
  uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid,text
) TO service_role;

-- Finance preview RPC: property managers can preview a quote only for their active property.
CREATE OR REPLACE FUNCTION public.preview_staynas_pricing_adjustments(
  _property_id uuid,_room_id uuid,_check_in date,_check_out date,_adults integer,
  _children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0,
  _extras jsonb DEFAULT '[]'::jsonb,_rate_plan_id uuid DEFAULT NULL,
  _promo_code text DEFAULT NULL,_guest_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $preview$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),'');
  v_quote jsonb;
BEGIN
  IF v_role<>'service_role' THEN
    IF v_uid IS NULL
       OR public.staynas_active_property_id(v_uid) IS DISTINCT FROM _property_id
       OR NOT public.staynas_user_has_property_access(v_uid,_property_id)
       OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','admin','finance']::public.app_role[]) THEN
      RETURN jsonb_build_object('ok',false,'error_code','AUTHORIZATION_DENIED','message','Pricing preview is restricted to authorised property finance users');
    END IF;
  END IF;
  IF _room_id IS NULL OR _check_in IS NULL OR _check_out<=_check_in
     OR jsonb_typeof(COALESCE(_extras,'[]'::jsonb))<>'array' THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_PRICING_CONTEXT','message','Room, stay and extras are required');
  END IF;
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  PERFORM set_config('staynas.promo_code',COALESCE(_promo_code,''),true);
  PERFORM set_config('staynas.guest_key',CASE WHEN NULLIF(btrim(_guest_email),'') IS NULL
    THEN '' ELSE md5(lower(trim(_guest_email))) END,true);
  v_quote:=public.calculate_staynas_booking_quote(
    _property_id,_room_id,_check_in,_check_out,_adults,
    COALESCE(_children_below_6,0),COALESCE(_children_7_plus,0),COALESCE(_extras,'[]'::jsonb)
  );
  RETURN v_quote;
END;
$preview$;

REVOKE ALL ON FUNCTION public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_staynas_pricing_adjustments(uuid,uuid,date,date,integer,integer,integer,jsonb,uuid,text,text)
  TO authenticated,service_role;

COMMIT;
