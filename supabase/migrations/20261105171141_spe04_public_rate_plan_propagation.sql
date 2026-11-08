-- SPE-04.07.02 — propagate explicit plan selection through shared booking contracts.
BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_staynas_room_pricing(
  _property_id uuid,_room_id uuid,_check_in date,_check_out date,
  _adults integer,_children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $adapter$
DECLARE
  v_result jsonb;
  v_nightly jsonb;
  v_room public.rooms%ROWTYPE;
  v_rate_plan_id uuid;
BEGIN
  v_rate_plan_id := NULLIF(current_setting('staynas.rate_plan_id',true),'')::uuid;
  v_result:=public.resolve_staynas_published_room_pricing(
    _property_id,_room_id,_check_in,_check_out,_adults,
    COALESCE(_children_below_6,0),COALESCE(_children_7_plus,0),v_rate_plan_id,now()
  );
  IF v_result->>'ok'='false' THEN RETURN v_result; END IF;
  IF v_result->>'mode'='legacy' THEN RETURN v_result->'pricing'; END IF;

  SELECT * INTO v_room FROM public.rooms r
  WHERE r.id=_room_id AND r.property_id=_property_id AND r.status='active';
  SELECT COALESCE(jsonb_agg(
    n.value || jsonb_build_object(
      'base_rate',n.value->'source_rate','occupancy_surcharge',0,'adjustment',0,
      'applied_rule_id',NULL,'applied_rule_type',n.value->>'source'
    ) ORDER BY n.ordinality
  ),'[]'::jsonb)
  INTO v_nightly
  FROM jsonb_array_elements(v_result->'nightly') WITH ORDINALITY n(value,ordinality);

  RETURN jsonb_build_object(
    'ok',true,'property_id',_property_id,'room_id',_room_id,
    'currency',v_result->>'currency','check_in',_check_in,'check_out',_check_out,
    'nights',(v_result->>'nights')::integer,'adults',_adults,
    'children_below_6',COALESCE(_children_below_6,0),
    'children_7_plus',COALESCE(_children_7_plus,0),
    'occupants',(v_result->>'occupants')::integer,
    'paid_occupants',(v_result->>'billable_occupants')::integer,
    'extra_occupants',0,'minimum_stay',COALESCE((v_result->>'minimum_stay')::integer,1),
    'nightly',v_nightly,
    'accommodation_subtotal',(v_result->>'accommodation_subtotal')::numeric,
    'pricing_evidence',jsonb_build_object(
      'rate_plan_id',v_result->'rate_plan_id','publication_id',v_result->'publication_id',
      'publication_number',v_result->'publication_number','rate_plan_version',v_result->'rate_plan_version',
      'snapshot_hash',v_result->'snapshot_hash','timezone',v_result->'timezone'
    )
  );
END;
$adapter$;

CREATE OR REPLACE FUNCTION public.get_staynas_booking_quote_with_rate_plan(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,_adults integer,
  _children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0,
  _extras jsonb DEFAULT '[]'::jsonb,_rate_plan_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $quote$
DECLARE v_room_id uuid;
BEGIN
  SELECT r.id INTO v_room_id FROM public.rooms r
  WHERE r.property_id=_property_id AND r.slug=_room_slug AND r.status='active';
  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error_code','ROOM_NOT_FOUND','message','Room not found for property');
  END IF;
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  RETURN public.calculate_staynas_booking_quote(
    _property_id,v_room_id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus,_extras
  );
END;
$quote$;

CREATE OR REPLACE FUNCTION public.get_staynas_room_availability_priced_with_rate_plan(
  _check_in date,_check_out date,_property_id uuid,_adults integer DEFAULT 1,
  _children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0,
  _rate_plan_id uuid DEFAULT NULL
) RETURNS TABLE(
  room_id uuid,slug text,name text,base_price numeric,currency text,
  capacity_adults integer,capacity_children integer,max_occupancy integer,
  included_guests integer,extra_guest_fee numeric,nights integer,nightly_total numeric,
  min_available integer,is_available boolean,fits_occupancy boolean,pricing_quote jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $availability$
BEGIN
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  RETURN QUERY
  SELECT a.room_id,a.slug,a.name,a.base_price,a.currency,a.capacity_adults,a.capacity_children,
    a.max_occupancy,a.included_guests,a.extra_guest_fee,a.nights,a.nightly_total,a.min_available,
    CASE WHEN a.pricing_quote->>'error_code'='RATE_PLAN_REQUIRED'
      THEN a.min_available>0 ELSE a.is_available END AS is_available,
    a.fits_occupancy,a.pricing_quote
  FROM public.get_staynas_room_availability_priced(
    _check_in,_check_out,_property_id,_adults,_children_below_6,_children_7_plus
  ) a;
END;
$availability$;

CREATE OR REPLACE FUNCTION public.create_booking_for_property_with_rate_plan(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,
  _adults integer,_children integer,_guest_name text,_guest_email text,
  _guest_phone text,_country text,_special_requests text,
  _extras jsonb DEFAULT '[]'::jsonb,_children_below_6 integer DEFAULT NULL,
  _children_7_plus integer DEFAULT NULL,_hold_id uuid DEFAULT NULL,
  _session_id text DEFAULT NULL,_payment_method text DEFAULT 'online',
  _rate_plan_id uuid DEFAULT NULL
) RETURNS TABLE(
  booking_id uuid,reference text,total numeric,currency text,
  taxes numeric,tax_addition numeric,tax_breakdown jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $booking$
BEGIN
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  RETURN QUERY SELECT * FROM public.create_booking_for_property(
    _property_id,_room_slug,_check_in,_check_out,_adults,_children,
    _guest_name,_guest_email,_guest_phone,_country,_special_requests,
    _extras,_children_below_6,_children_7_plus,_hold_id,_session_id,_payment_method
  );
END;
$booking$;

REVOKE ALL ON FUNCTION public.get_staynas_booking_quote_with_rate_plan(uuid,text,date,date,integer,integer,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_staynas_room_availability_priced_with_rate_plan(date,date,uuid,integer,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_staynas_booking_quote_with_rate_plan(uuid,text,date,date,integer,integer,integer,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_staynas_room_availability_priced_with_rate_plan(date,date,uuid,integer,integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid) TO service_role;

COMMIT;
