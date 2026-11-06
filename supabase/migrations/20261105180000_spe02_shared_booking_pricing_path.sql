-- SPE-02 shared pricing path: one database-authoritative resolver for
-- availability, guest quotes and booking creation.
BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_staynas_room_pricing(
  _property_id uuid,
  _room_id uuid,
  _check_in date,
  _check_out date,
  _adults integer,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_property_currency text;
  v_nights integer;
  v_children integer := COALESCE(_children_below_6,0) + COALESCE(_children_7_plus,0);
  v_occupants integer;
  v_paid integer;
  v_extra integer;
  v_min_stay integer := 1;
  v_day date;
  v_inventory public.room_inventory%ROWTYPE;
  v_base numeric;
  v_surcharge numeric;
  v_pre numeric;
  v_adjust numeric;
  v_rate numeric;
  v_rule_id uuid;
  v_rule_type text;
  v_rule_adjust_kind text;
  v_rule_adjust_value numeric;
  v_nightly jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
BEGIN
  IF _property_id IS NULL OR _room_id IS NULL OR _check_in IS NULL OR _check_out IS NULL
     OR _check_out <= _check_in THEN
    RAISE EXCEPTION 'A valid property, room and date range are required';
  END IF;
  IF COALESCE(_adults,0) < 1 OR COALESCE(_children_below_6,0) < 0 OR COALESCE(_children_7_plus,0) < 0 THEN
    RAISE EXCEPTION 'At least one adult and non-negative child counts are required';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms r
  WHERE r.id = _room_id AND r.property_id = _property_id AND r.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Room does not belong to the active property'; END IF;

  SELECT upper(p.currency) INTO v_property_currency
  FROM public.staynas_properties p
  WHERE p.id = _property_id AND p.status = 'active';
  IF v_property_currency IS NULL OR v_property_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Property currency must be explicitly configured';
  END IF;
  IF upper(COALESCE(v_room.currency,'')) <> v_property_currency THEN
    RAISE EXCEPTION 'Room currency % does not match property currency %', v_room.currency, v_property_currency;
  END IF;

  v_occupants := _adults + v_children;
  v_paid := _adults + COALESCE(_children_7_plus,0);
  IF _adults > COALESCE(v_room.capacity_adults,0)
     OR v_children > COALESCE(v_room.capacity_children,0)
     OR v_occupants > COALESCE(v_room.max_occupancy,0) THEN
    RAISE EXCEPTION 'Room occupancy capacity exceeded';
  END IF;
  IF COALESCE(v_room.base_price,0) < 0 OR COALESCE(v_room.extra_guest_fee,0) < 0 THEN
    RAISE EXCEPTION 'Room pricing configuration cannot be negative';
  END IF;
  v_extra := GREATEST(0, v_paid - COALESCE(v_room.included_guests,1));
  v_surcharge := round(v_extra * COALESCE(v_room.extra_guest_fee,0),2);
  v_nights := _check_out - _check_in;

  SELECT COALESCE(MAX(pr.min_stay_nights),1) INTO v_min_stay
  FROM public.pricing_rules pr
  WHERE pr.property_id = _property_id
    AND pr.active = true
    AND pr.rule_type = 'min_stay'
    AND (pr.scope = 'all' OR pr.room_id = _room_id)
    AND (pr.starts_on IS NULL OR pr.starts_on <= _check_in)
    AND (pr.ends_on IS NULL OR pr.ends_on >= _check_in)
    AND (pr.weekdays IS NULL OR cardinality(pr.weekdays)=0 OR extract(dow from _check_in)::integer = ANY(pr.weekdays));
  IF v_nights < v_min_stay THEN
    RAISE EXCEPTION 'Minimum stay is % nights', v_min_stay;
  END IF;

  v_day := _check_in;
  WHILE v_day < _check_out LOOP
    IF EXISTS (
      SELECT 1 FROM public.pricing_rules pr
      WHERE pr.property_id = _property_id
        AND pr.active = true
        AND pr.rule_type = 'blackout'
        AND (pr.scope = 'all' OR pr.room_id = _room_id)
        AND (pr.starts_on IS NULL OR pr.starts_on <= v_day)
        AND (pr.ends_on IS NULL OR pr.ends_on >= v_day)
        AND (pr.weekdays IS NULL OR cardinality(pr.weekdays)=0 OR extract(dow from v_day)::integer = ANY(pr.weekdays))
    ) THEN
      RAISE EXCEPTION 'Pricing blackout applies on %', v_day;
    END IF;

    SELECT * INTO v_inventory
    FROM public.room_inventory i
    WHERE i.room_id = _room_id AND i.date = v_day;
    v_base := COALESCE(v_inventory.price_override, v_room.base_price);
    IF v_base IS NULL OR v_base < 0 THEN RAISE EXCEPTION 'Invalid daily room rate on %', v_day; END IF;
    v_pre := round(v_base + v_surcharge,2);
    v_adjust := 0;
    v_rate := v_pre;
    v_rule_id := NULL;
    v_rule_type := NULL;
    v_rule_adjust_kind := NULL;
    v_rule_adjust_value := NULL;

    SELECT pr.id,pr.rule_type,pr.adjust_kind,pr.adjust_value
    INTO v_rule_id,v_rule_type,v_rule_adjust_kind,v_rule_adjust_value
    FROM public.pricing_rules pr
    WHERE pr.property_id = _property_id
      AND pr.active = true
      AND pr.rule_type NOT IN ('min_stay','blackout')
      AND pr.adjust_kind IS NOT NULL
      AND pr.adjust_value IS NOT NULL
      AND (pr.scope = 'all' OR pr.room_id = _room_id)
      AND (pr.starts_on IS NULL OR pr.starts_on <= v_day)
      AND (pr.ends_on IS NULL OR pr.ends_on >= v_day)
      AND (pr.weekdays IS NULL OR cardinality(pr.weekdays)=0 OR extract(dow from v_day)::integer = ANY(pr.weekdays))
    ORDER BY CASE WHEN pr.room_id = _room_id THEN 0 ELSE 1 END,
             pr.priority ASC, pr.id ASC
    LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
      IF v_rule_adjust_kind = 'percent' THEN
        v_adjust := round(v_pre * v_rule_adjust_value / 100,2);
        v_rate := round(v_pre + v_adjust,2);
      ELSIF v_rule_adjust_kind = 'fixed' THEN
        v_adjust := round(v_rule_adjust_value,2);
        v_rate := round(v_pre + v_adjust,2);
      ELSIF v_rule_adjust_kind = 'override' THEN
        v_rate := round(v_rule_adjust_value,2);
        v_adjust := round(v_rate - v_pre,2);
      ELSE
        RAISE EXCEPTION 'Unsupported pricing adjustment kind';
      END IF;
    END IF;
    IF v_rate < 0 THEN RAISE EXCEPTION 'Pricing rules cannot produce a negative rate'; END IF;

    v_subtotal := round(v_subtotal + v_rate,2);
    v_nightly := v_nightly || jsonb_build_array(jsonb_build_object(
      'date',v_day,'base_rate',v_base,'occupancy_surcharge',v_surcharge,
      'adjustment',v_adjust,'nightly_rate',v_rate,'currency',v_property_currency,
      'applied_rule_id',v_rule_id,'applied_rule_type',v_rule_type
    ));
    v_day := v_day + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'property_id',_property_id,'room_id',_room_id,'currency',v_property_currency,
    'check_in',_check_in,'check_out',_check_out,'nights',v_nights,
    'adults',_adults,'children_below_6',COALESCE(_children_below_6,0),
    'children_7_plus',COALESCE(_children_7_plus,0),'occupants',v_occupants,
    'paid_occupants',v_paid,'extra_occupants',v_extra,'minimum_stay',v_min_stay,
    'nightly',v_nightly,'accommodation_subtotal',v_subtotal
  );
END;
$$;

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
  v_tax jsonb;
  v_tax_addition numeric := 0;
  v_tax_total numeric := 0;
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

  v_tax := public.calculate_staynas_booking_taxes(
    _property_id,_check_in,v_nights,(v_room_quote->>'accommodation_subtotal')::numeric,
    v_extras_total,v_currency
  );
  v_tax_total := COALESCE((v_tax->>'tax_total')::numeric,0);
  v_tax_addition := COALESCE((v_tax->>'tax_addition')::numeric,0);
  v_total := round((v_room_quote->>'accommodation_subtotal')::numeric + v_extras_total + v_tax_addition,2);

  RETURN jsonb_build_object(
    'property_id',_property_id,'room_id',_room_id,'currency',v_currency,
    'check_in',_check_in,'check_out',_check_out,'nights',v_nights,
    'nightly',v_room_quote->'nightly',
    'accommodation_subtotal',(v_room_quote->>'accommodation_subtotal')::numeric,
    'extras',v_extra_lines,'extras_total',v_extras_total,
    'taxes',v_tax_total,'tax_addition',v_tax_addition,
    'tax_breakdown',COALESCE(v_tax->'breakdown','[]'::jsonb),
    'total',v_total,'deposit_amount',round(v_total/2,2),
    'balance_due',v_total-round(v_total/2,2),
    'minimum_stay',(v_room_quote->>'minimum_stay')::integer,
    'occupants',(v_room_quote->>'occupants')::integer,
    'paid_occupants',(v_room_quote->>'paid_occupants')::integer,
    'extra_occupants',(v_room_quote->>'extra_occupants')::integer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.try_calculate_staynas_booking_quote(
  _property_id uuid,
  _room_id uuid,
  _check_in date,
  _check_out date,
  _adults integer,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $spe02_safe$
BEGIN
  RETURN public.calculate_staynas_booking_quote(
    _property_id,_room_id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus,'[]'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$spe02_safe$;

CREATE OR REPLACE FUNCTION public.get_staynas_room_availability_priced(
  _check_in date,
  _check_out date,
  _property_id uuid,
  _adults integer DEFAULT 1,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0
)
RETURNS TABLE(
  room_id uuid, slug text, name text, base_price numeric, currency text,
  capacity_adults integer, capacity_children integer, max_occupancy integer,
  included_guests integer, extra_guest_fee numeric, nights integer,
  nightly_total numeric, min_available integer, is_available boolean,
  fits_occupancy boolean, pricing_quote jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active') THEN
    RAISE EXCEPTION 'Property is not active or does not exist';
  END IF;
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in,_check_out - interval '1 day',interval '1 day')::date AS d
  ), inventory AS (
    SELECT r.id AS room_id, dr.d,
      COALESCE(i.available_units,r.total_units) AS units,
      COALESCE(i.is_blocked,false) AS blocked,
      (SELECT count(*)::integer FROM public.booking_holds h
       WHERE h.room_id=r.id AND h.status='active' AND h.expires_at>now()
         AND h.check_in<=dr.d AND h.check_out>dr.d) AS hold_count
    FROM public.rooms r CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory i ON i.room_id=r.id AND i.date=dr.d
    WHERE r.property_id=_property_id AND r.status='active'
  ), stock AS (
    SELECT inventory.room_id, min(greatest(units-hold_count,0))::integer AS min_units,
      bool_and(NOT blocked AND units-hold_count>0) AS available
    FROM inventory GROUP BY inventory.room_id
  )
  SELECT r.id,r.slug,r.name,r.base_price,r.currency,r.capacity_adults,r.capacity_children,
    r.max_occupancy,r.included_guests,r.extra_guest_fee,(_check_out-_check_in),
    CASE WHEN q.quote IS NULL THEN 0 ELSE (q.quote->>'total')::numeric END,
    COALESCE(s.min_units,0),(COALESCE(s.available,false) AND q.quote IS NOT NULL),
    (_adults<=r.capacity_adults
      AND (_children_below_6+_children_7_plus)<=r.capacity_children
      AND (_adults+_children_below_6+_children_7_plus)<=r.max_occupancy),
    q.quote
  FROM public.rooms r
  LEFT JOIN stock s ON s.room_id=r.id
  LEFT JOIN LATERAL (
    SELECT public.try_calculate_staynas_booking_quote(
      _property_id,r.id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus
    ) AS quote
    WHERE _adults<=r.capacity_adults
      AND (_children_below_6+_children_7_plus)<=r.capacity_children
      AND (_adults+_children_below_6+_children_7_plus)<=r.max_occupancy
  ) q ON true
  WHERE r.property_id=_property_id AND r.status='active'
  ORDER BY CASE WHEN q.quote IS NULL THEN r.base_price ELSE (q.quote->>'total')::numeric END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staynas_booking_quote(
  _property_id uuid,
  _room_slug text,
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
DECLARE v_room_id uuid;
BEGIN
  SELECT r.id INTO v_room_id FROM public.rooms r
  WHERE r.property_id=_property_id AND r.slug=_room_slug AND r.status='active';
  IF v_room_id IS NULL THEN RAISE EXCEPTION 'Room not found for property'; END IF;
  RETURN public.calculate_staynas_booking_quote(
    _property_id,v_room_id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus,_extras
  );
END;
$$;

-- Tax-aware property-scoped booking RPC. Keep its existing public signature and ACL.
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

REVOKE ALL ON FUNCTION public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.try_calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_staynas_booking_quote(uuid,text,date,date,integer,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
DO $
DECLARE
  v_legacy_signature regprocedure := to_regprocedure(
    'public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)'
  );
BEGIN
  IF v_legacy_signature IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',v_legacy_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',v_legacy_signature);
  END IF;
END;
$;

REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_staynas_booking_quote(uuid,text,date,date,integer,integer,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text) TO service_role;

COMMIT;
