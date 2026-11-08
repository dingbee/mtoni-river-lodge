BEGIN;
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
    'promotions',COALESCE(v_adjustments->'promotions','[]'::jsonb),
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


COMMIT;