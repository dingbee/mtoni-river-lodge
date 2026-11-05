-- SPE-04.04-A: route shared accommodation pricing through the SPE-04 resolver.
-- Feature branch only. Do not apply to production without separate release approval.
BEGIN;

-- Preserve the SPE-02 calculator for legacy-only properties. The SPE-04 resolver
-- calls this renamed function in compatibility mode, preventing recursive routing.
ALTER FUNCTION public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer)
  RENAME TO calculate_staynas_room_pricing_legacy;

CREATE OR REPLACE FUNCTION public.resolve_staynas_published_room_pricing(
  _property_id uuid,
  _room_id uuid,
  _check_in date,
  _check_out date,
  _adults integer,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0,
  _rate_plan_id uuid DEFAULT NULL,
  _booking_timestamp timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := current_setting('request.jwt.claim.role',true);
  v_room public.rooms%ROWTYPE;
  v_property_currency text;
  v_timezone text;
  v_plan record;
  v_plan_count integer;
  v_active_plan_count integer;
  v_publication record;
  v_data jsonb;
  v_base jsonb;
  v_daily jsonb;
  v_seasons jsonb;
  v_restrictions jsonb;
  v_occupancy jsonb;
  v_occupancy_key text;
  v_rate jsonb;
  v_override record;
  v_day date;
  v_nights integer;
  v_occupants integer;
  v_paid_occupants integer;
  v_rate_amount numeric;
  v_nightly_rate numeric;
  v_subtotal numeric := 0;
  v_source text;
  v_source_id uuid;
  v_source_key text;
  v_breakdown jsonb := '[]'::jsonb;
  v_rule record;
  v_min_los integer := 1;
  v_max_los integer;
  v_local_booking timestamp;
  v_hours numeric;
  v_days numeric;
  v_matches integer;
BEGIN
  IF _property_id IS NULL OR _room_id IS NULL OR _check_in IS NULL OR _check_out IS NULL
     OR _check_out<=_check_in OR COALESCE(_adults,0)<1
     OR COALESCE(_children_below_6,0)<0 OR COALESCE(_children_7_plus,0)<0 THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION',
      'message','A valid property, room, stay and occupancy are required');
  END IF;

  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL
       OR public.staynas_active_property_id(v_uid) IS DISTINCT FROM _property_id
       OR NOT public.staynas_user_has_property_access(v_uid,_property_id)
       OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','finance','admin','reservations','reception']::public.app_role[]) THEN
      RETURN jsonb_build_object('ok',false,'error_code','AUTHORIZATION_DENIED',
        'message','Pricing access denied for property');
    END IF;
  END IF;

  SELECT * INTO v_room FROM public.rooms r
  WHERE r.id=_room_id AND r.property_id=_property_id AND r.status='active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error_code','ROOM_NOT_IN_PROPERTY',
      'message','Room is not active in the requested property');
  END IF;

  SELECT upper(p.currency),p.timezone
    INTO v_property_currency,v_timezone
  FROM public.staynas_properties p
  WHERE p.id=_property_id AND p.status='active';
  IF v_property_currency IS NULL OR v_property_currency !~ '^[A-Z]{3}$'
     OR v_timezone IS NULL OR NOT EXISTS (
       SELECT 1 FROM pg_timezone_names WHERE name=v_timezone
     ) THEN
    RETURN jsonb_build_object('ok',false,'error_code','PROPERTY_CONTEXT_INVALID',
      'message','Property currency and valid IANA timezone must be configured');
  END IF;
  IF upper(COALESCE(v_room.currency,''))<>v_property_currency THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Room currency does not match property currency');
  END IF;

  v_nights := _check_out-_check_in;
  v_occupants := _adults+_children_below_6+_children_7_plus;
  v_paid_occupants := _adults+_children_7_plus;
  IF _adults>COALESCE(v_room.capacity_adults,0)
     OR _children_below_6+_children_7_plus>COALESCE(v_room.capacity_children,0)
     OR v_occupants>COALESCE(v_room.max_occupancy,0) THEN
    RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED',
      'message','Room occupancy capacity exceeded');
  END IF;

  SELECT count(*) INTO v_active_plan_count
  FROM public.staynas_rate_plans p
  WHERE p.property_id=_property_id AND p.publication_status='published' AND p.active=true;

  SELECT count(*) INTO v_plan_count
  FROM public.staynas_rate_plans p
  JOIN public.staynas_rate_plan_room_types a
    ON a.property_id=p.property_id AND a.rate_plan_id=p.id AND a.active=true
  JOIN public.staynas_rate_plan_publications pub
    ON pub.property_id=p.property_id AND pub.rate_plan_id=p.id
  WHERE p.property_id=_property_id AND p.publication_status='published' AND p.active=true
    AND a.room_type_id=v_room.catalogue_type_id
    AND (p.effective_from IS NULL OR p.effective_from<=_check_in)
    AND (p.effective_to IS NULL OR p.effective_to>=_check_out-1)
    AND (pub.effective_from IS NULL OR pub.effective_from<=_check_in)
    AND (pub.effective_to IS NULL OR pub.effective_to>=_check_out-1)
    AND (_rate_plan_id IS NULL OR p.id=_rate_plan_id)
    AND pub.publication_number=(
      SELECT max(pub2.publication_number) FROM public.staynas_rate_plan_publications pub2
      WHERE pub2.property_id=pub.property_id AND pub2.rate_plan_id=pub.rate_plan_id
    );

  IF _rate_plan_id IS NOT NULL AND v_plan_count=0 THEN
    RETURN jsonb_build_object('ok',false,'error_code','NO_ELIGIBLE_RATE_PLAN',
      'message','Selected plan is not published, active, assigned, or effective for the complete stay');
  END IF;
  IF _rate_plan_id IS NULL AND v_plan_count>1 THEN
    RETURN jsonb_build_object('ok',false,'error_code','RATE_PLAN_REQUIRED',
      'message','More than one eligible published rate plan applies; select one explicitly');
  END IF;
  IF v_plan_count=0 THEN
    IF v_active_plan_count>0 OR _rate_plan_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok',false,'error_code','NO_ELIGIBLE_RATE_PLAN',
        'message','Property has active published plans but none is eligible for this room and stay');
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'mode','legacy','rate_plan_id',NULL,'publication_id',NULL,
      'pricing',public.calculate_staynas_room_pricing_legacy(
        _property_id,_room_id,_check_in,_check_out,_adults,
        COALESCE(_children_below_6,0),COALESCE(_children_7_plus,0)
      )
    );
  END IF;

  SELECT p.id,p.code,p.name,p.currency,p.pricing_basis,p.version,p.property_id
    INTO v_plan
  FROM public.staynas_rate_plans p
  JOIN public.staynas_rate_plan_room_types a
    ON a.property_id=p.property_id AND a.rate_plan_id=p.id AND a.active=true
  WHERE p.id=COALESCE(_rate_plan_id,(
    SELECT p2.id FROM public.staynas_rate_plans p2
    JOIN public.staynas_rate_plan_room_types a2
      ON a2.property_id=p2.property_id AND a2.rate_plan_id=p2.id AND a2.active=true
    JOIN public.staynas_rate_plan_publications x
      ON x.property_id=p2.property_id AND x.rate_plan_id=p2.id
    WHERE p2.property_id=_property_id AND p2.publication_status='published' AND p2.active=true
      AND a2.room_type_id=v_room.catalogue_type_id
      AND (p2.effective_from IS NULL OR p2.effective_from<=_check_in)
      AND (p2.effective_to IS NULL OR p2.effective_to>=_check_out-1)
      AND (x.effective_from IS NULL OR x.effective_from<=_check_in)
      AND (x.effective_to IS NULL OR x.effective_to>=_check_out-1)
    ORDER BY p2.id LIMIT 1
  )) AND p.property_id=_property_id AND a.room_type_id=v_room.catalogue_type_id
  LIMIT 1;

  SELECT pub.* INTO v_publication
  FROM public.staynas_rate_plan_publications pub
  WHERE pub.property_id=_property_id AND pub.rate_plan_id=v_plan.id
  ORDER BY pub.publication_number DESC LIMIT 1;
  IF NOT FOUND OR v_publication.snapshot_hash IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error_code','RATE_SOURCE_MISSING',
      'message','Eligible plan has no immutable publication snapshot');
  END IF;
  IF upper(v_plan.currency)<>v_property_currency
     OR upper(v_publication.currency)<>v_property_currency THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Published plan currency does not match property currency');
  END IF;

  v_data := v_publication.resolved_data;
  v_base := COALESCE(v_data->'base_rates','{}'::jsonb);
  v_daily := COALESCE(v_data->'daily_rates','{}'::jsonb);
  v_seasons := COALESCE(v_data->'seasonal_rates','{}'::jsonb);
  v_restrictions := COALESCE(v_data->'restrictions','{}'::jsonb);
  v_occupancy := COALESCE(v_data->'occupancy_rules','{}'::jsonb);

  IF jsonb_typeof(v_base)<>'object' OR jsonb_typeof(v_daily)<>'object'
     OR jsonb_typeof(v_seasons)<>'object' OR jsonb_typeof(v_restrictions)<>'object'
     OR jsonb_typeof(v_occupancy)<>'object' THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION',
      'message','Published pricing snapshot contains malformed commercial data');
  END IF;

  -- Validate applicable cumulative restrictions before calculating any amount.
  FOR v_rule IN SELECT key,value FROM jsonb_each(v_restrictions)
    WHERE value<>'null'::jsonb AND value->>'active'='true'
  LOOP
    IF NOT (v_rule.value->'room_type_ids' @> jsonb_build_array(v_room.catalogue_type_id::text)) THEN
      CONTINUE;
    END IF;
    CASE v_rule.value->>'type'
      WHEN 'min_los' THEN IF _check_in BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date THEN v_min_los:=GREATEST(v_min_los,(v_rule.value->>'value')::integer); END IF;
      WHEN 'max_los' THEN IF _check_in BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date THEN v_max_los:=LEAST(COALESCE(v_max_los,365),(v_rule.value->>'value')::integer); END IF;
      WHEN 'closed_to_arrival' THEN
        IF _check_in BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date THEN
          RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED','message','Closed to arrival');
        END IF;
      WHEN 'closed_to_departure' THEN
        IF _check_out BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date THEN
          RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED','message','Closed to departure');
        END IF;
      WHEN 'stop_sell' THEN
        IF EXISTS (SELECT 1 FROM generate_series(_check_in,_check_out-1,interval '1 day') d
          WHERE d::date BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date) THEN
          RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED','message','Stop sell applies to one or more stay nights');
        END IF;
      WHEN 'advance_booking_min_hours' THEN
        IF _check_in BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date THEN
          v_local_booking:=COALESCE(_booking_timestamp,now()) AT TIME ZONE v_timezone;
          v_hours:=extract(epoch FROM (_check_in::timestamp-v_local_booking))/3600;
          IF v_hours < (v_rule.value->>'value')::numeric THEN
            RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED','message','Minimum advance booking window not met');
          END IF;
        END IF;
      WHEN 'advance_booking_max_days' THEN
        IF _check_in BETWEEN (v_rule.value->>'start_date')::date AND (v_rule.value->>'end_date')::date THEN
          v_local_booking:=COALESCE(_booking_timestamp,now()) AT TIME ZONE v_timezone;
          v_days:=extract(epoch FROM (_check_in::timestamp-v_local_booking))/86400;
          IF v_days > (v_rule.value->>'value')::numeric THEN
            RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED','message','Maximum advance booking window exceeded');
          END IF;
        END IF;
      ELSE
        RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION','message','Unsupported restriction type');
    END CASE;
  END LOOP;
  IF v_nights<v_min_los OR (v_max_los IS NOT NULL AND v_nights>v_max_los) THEN
    RETURN jsonb_build_object('ok',false,'error_code','RESTRICTION_BLOCKED',
      'message',format('Stay length must be between %s and %s nights',v_min_los,COALESCE(v_max_los::text,'unlimited')));
  END IF;

  IF v_plan.pricing_basis='occupancy_based' THEN
    v_occupancy_key:=format('%s:%s:%s',_adults,COALESCE(_children_below_6,0),COALESCE(_children_7_plus,0));
  END IF;

  v_day:=_check_in;
  WHILE v_day<_check_out LOOP
    v_rate:=NULL; v_source:=NULL; v_source_id:=NULL; v_source_key:=NULL;

    -- Approved overrides: exact room/date, plan+room type, room type, then plan.
    SELECT o.* INTO v_override FROM public.staynas_rate_overrides o
    WHERE o.property_id=_property_id AND o.status='approved'
      AND o.scope='room_date' AND o.room_id=_room_id
      AND o.effective_from=v_day AND o.effective_to=v_day
    ORDER BY o.approved_at DESC,o.id LIMIT 1;
    IF FOUND THEN v_rate:=jsonb_build_object('nightly_rate',v_override.nightly_rate,'currency',v_override.currency);
      v_source:='approved_room_date_override'; v_source_id:=v_override.id; v_source_key:=v_override.id::text;
    ELSE
      SELECT o.* INTO v_override FROM public.staynas_rate_overrides o
      WHERE o.property_id=_property_id AND o.status='approved'
        AND o.scope='rate_plan_room_type' AND o.rate_plan_id=v_plan.id
        AND o.room_type_id=v_room.catalogue_type_id
        AND v_day BETWEEN o.effective_from AND o.effective_to
      ORDER BY o.approved_at DESC,o.id LIMIT 1;
      IF FOUND THEN v_rate:=jsonb_build_object('nightly_rate',v_override.nightly_rate,'currency',v_override.currency);
        v_source:='approved_plan_room_type_override'; v_source_id:=v_override.id; v_source_key:=v_override.id::text;
      ELSE
        SELECT o.* INTO v_override FROM public.staynas_rate_overrides o
        WHERE o.property_id=_property_id AND o.status='approved'
          AND o.scope='room_type' AND o.room_type_id=v_room.catalogue_type_id
          AND v_day BETWEEN o.effective_from AND o.effective_to
        ORDER BY o.approved_at DESC,o.id LIMIT 1;
        IF FOUND THEN v_rate:=jsonb_build_object('nightly_rate',v_override.nightly_rate,'currency',v_override.currency);
          v_source:='approved_room_type_override'; v_source_id:=v_override.id; v_source_key:=v_override.id::text;
        ELSE
          SELECT o.* INTO v_override FROM public.staynas_rate_overrides o
          WHERE o.property_id=_property_id AND o.status='approved'
            AND o.scope='rate_plan' AND o.rate_plan_id=v_plan.id
            AND v_day BETWEEN o.effective_from AND o.effective_to
          ORDER BY o.approved_at DESC,o.id LIMIT 1;
          IF FOUND THEN v_rate:=jsonb_build_object('nightly_rate',v_override.nightly_rate,'currency',v_override.currency);
            v_source:='approved_plan_override'; v_source_id:=v_override.id; v_source_key:=v_override.id::text;
          END IF;
        END IF;
      END IF;
    END IF;

    -- Published daily rate supersedes seasonal and inherited/base rate.
    IF v_rate IS NULL THEN
      v_rate:=v_daily->v_day::text->v_room.catalogue_type_id::text;
      IF v_rate IS NOT NULL AND v_rate<>'null'::jsonb AND COALESCE((v_rate->>'active')::boolean,false) THEN
        v_source:='published_daily_rate'; v_source_key:=v_day::text;
      ELSE
        v_rate:=NULL;
      END IF;
    END IF;

    IF v_rate IS NULL THEN
      SELECT count(*) INTO v_matches
      FROM jsonb_each(v_seasons) s(key,value)
      WHERE value<>'null'::jsonb AND COALESCE((value->>'active')::boolean,false)
        AND (value->>'start_date')::date<=v_day AND (value->>'end_date')::date>=v_day
        AND value->'room_type_ids' @> jsonb_build_array(v_room.catalogue_type_id::text);
      SELECT s.key,s.value INTO v_source_key,v_rate
      FROM jsonb_each(v_seasons) s(key,value)
      WHERE value<>'null'::jsonb AND COALESCE((value->>'active')::boolean,false)
        AND (value->>'start_date')::date<=v_day AND (value->>'end_date')::date>=v_day
        AND value->'room_type_ids' @> jsonb_build_array(v_room.catalogue_type_id::text)
      ORDER BY (value->>'priority')::integer DESC,s.key LIMIT 1;
      IF v_matches>1 AND EXISTS (
        SELECT 1 FROM jsonb_each(v_seasons) s(key,value)
        WHERE value<>'null'::jsonb AND COALESCE((value->>'active')::boolean,false)
          AND (value->>'start_date')::date<=v_day AND (value->>'end_date')::date>=v_day
          AND value->'room_type_ids' @> jsonb_build_array(v_room.catalogue_type_id::text)
          GROUP BY (value->>'priority')::integer HAVING count(*)>1
      ) THEN
        RETURN jsonb_build_object('ok',false,'error_code','AMBIGUOUS_RATE_SOURCE',
          'message','Equal-priority seasonal rates overlap for a charged night');
      END IF;
      IF v_rate IS NOT NULL THEN v_source:='published_seasonal_rate'; END IF;
    END IF;

    IF v_rate IS NULL AND v_plan.pricing_basis='occupancy_based' THEN
      v_rate:=v_occupancy->v_room.catalogue_type_id::text->v_occupancy_key;
      IF v_rate IS NULL OR v_rate='null'::jsonb THEN
        RETURN jsonb_build_object('ok',false,'error_code','OCCUPANCY_RATE_MISSING',
          'message',format('No exact occupancy rate is published for %s',v_day));
      END IF;
      v_source:='published_occupancy_rate'; v_source_key:=v_occupancy_key;
    END IF;
    IF v_rate IS NULL AND v_plan.pricing_basis IN ('per_room','per_person') THEN
      v_rate:=v_base->v_room.catalogue_type_id::text;
      v_source:='published_base_rate'; v_source_key:=v_room.catalogue_type_id::text;
    END IF;
    IF v_rate IS NULL OR v_rate='null'::jsonb
       OR jsonb_typeof(v_rate->'nightly_rate') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_rate->'currency') IS DISTINCT FROM 'string' THEN
      RETURN jsonb_build_object('ok',false,'error_code','RATE_SOURCE_MISSING',
        'message',format('No valid published rate source for %s',v_day));
    END IF;
    IF v_rate->>'currency' IS DISTINCT FROM v_property_currency THEN
      RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
        'message',format('Rate currency mismatch on %s',v_day));
    END IF;
    v_rate_amount:=(v_rate->>'nightly_rate')::numeric;
    IF v_rate_amount<=0 THEN
      RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION',
        'message',format('Non-positive nightly rate on %s',v_day));
    END IF;
    IF v_source NOT IN ('published_occupancy_rate') THEN
      IF v_plan.pricing_basis='per_person' THEN
        v_nightly_rate:=round(v_rate_amount*v_paid_occupants,2);
      ELSE
        v_nightly_rate:=round(v_rate_amount,2);
      END IF;
    ELSE
      v_nightly_rate:=round(v_rate_amount,2);
    END IF;
    v_subtotal:=round(v_subtotal+v_nightly_rate,2);
    v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object(
      'date',v_day,'nightly_rate',v_nightly_rate,'source_rate',v_rate_amount,'currency',v_property_currency,
      'source',v_source,'source_id',v_source_id,'source_key',v_source_key,
      'rate_plan_id',v_plan.id,'publication_id',v_publication.id,
      'publication_number',v_publication.publication_number,
      'rate_plan_version',v_publication.rate_plan_version,
      'snapshot_hash',v_publication.snapshot_hash,
      'pricing_basis',v_plan.pricing_basis,'occupancy_key',v_occupancy_key
    ));
    v_day:=v_day+1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',true,'property_id',_property_id,'room_id',_room_id,
    'rate_plan_id',v_plan.id,'rate_plan_code',v_plan.code,
    'rate_plan_name',v_plan.name,'publication_id',v_publication.id,
    'publication_number',v_publication.publication_number,
    'rate_plan_version',v_publication.rate_plan_version,
    'snapshot_hash',v_publication.snapshot_hash,
    'currency',v_property_currency,'timezone',v_timezone,
    'check_in',_check_in,'check_out',_check_out,'nights',v_nights,
    'minimum_stay',v_min_los,
    'adults',_adults,'children_below_6',COALESCE(_children_below_6,0),
    'children_7_plus',COALESCE(_children_7_plus,0),'occupants',v_occupants,
    'billable_occupants',v_paid_occupants,'nightly',v_breakdown,
    'accommodation_subtotal',v_subtotal
  );
EXCEPTION
  WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('ok',false,'error_code','AUTHORIZATION_DENIED','message','Pricing access denied');
  WHEN invalid_text_representation OR numeric_value_out_of_range OR division_by_zero THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION','message','Published pricing data is malformed');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION','message','Published pricing resolution failed closed');
END;
$function$;

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
SET search_path=public
AS $adapter$
DECLARE
  v_result jsonb;
  v_nightly jsonb;
  v_room public.rooms%ROWTYPE;
BEGIN
  v_result:=public.resolve_staynas_published_room_pricing(
    _property_id,_room_id,_check_in,_check_out,_adults,
    COALESCE(_children_below_6,0),COALESCE(_children_7_plus,0),NULL,now()
  );
  IF v_result->>'ok'='false' THEN RETURN v_result; END IF;
  IF v_result->>'mode'='legacy' THEN RETURN v_result->'pricing'; END IF;

  SELECT * INTO v_room FROM public.rooms r
  WHERE r.id=_room_id AND r.property_id=_property_id AND r.status='active';
  SELECT COALESCE(jsonb_agg(
    n.value || jsonb_build_object(
      'base_rate',n.value->'source_rate',
      'occupancy_surcharge',0,
      'adjustment',0,
      'applied_rule_id',NULL,
      'applied_rule_type',n.value->>'source'
    ) ORDER BY n.ordinality
  ),'[]'::jsonb)
  INTO v_nightly
  FROM jsonb_array_elements(v_result->'nightly') WITH ORDINALITY n(value,ordinality);

  RETURN jsonb_build_object(
    'ok',true,'property_id',_property_id,'room_id',_room_id,
    'currency',v_result->>'currency','check_in',_check_in,'check_out',_check_out,
    'nights',(v_result->>'nights')::integer,
    'adults',_adults,'children_below_6',COALESCE(_children_below_6,0),
    'children_7_plus',COALESCE(_children_7_plus,0),
    'occupants',(v_result->>'occupants')::integer,
    'paid_occupants',(v_result->>'billable_occupants')::integer,
    'extra_occupants',0,'minimum_stay',COALESCE((v_result->>'minimum_stay')::integer,1),
    'nightly',v_nightly,
    'accommodation_subtotal',(v_result->>'accommodation_subtotal')::numeric,
    'pricing_evidence',jsonb_build_object(
      'rate_plan_id',v_result->'rate_plan_id',
      'publication_id',v_result->'publication_id',
      'publication_number',v_result->'publication_number',
      'rate_plan_version',v_result->'rate_plan_version',
      'snapshot_hash',v_result->'snapshot_hash',
      'timezone',v_result->'timezone'
    )
  );
END;
$adapter$;

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
    'pricing_evidence',v_room_quote->'pricing_evidence',
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
SET search_path=public
AS $safe$
DECLARE v_quote jsonb;
BEGIN
  v_quote:=public.calculate_staynas_booking_quote(
    _property_id,_room_id,_check_in,_check_out,_adults,_children_below_6,_children_7_plus,'[]'::jsonb
  );
  RETURN v_quote;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error_code','INVALID_RATE_CONFIGURATION',
    'message','Pricing quote failed closed');
END;
$safe$;

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
    CASE WHEN q.quote IS NULL OR q.quote->>'ok'='false' THEN 0 ELSE (q.quote->>'total')::numeric END,
    COALESCE(s.min_units,0),(COALESCE(s.available,false) AND q.quote IS NOT NULL AND COALESCE(q.quote->>'ok','true')<>'false'),
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
  ORDER BY CASE WHEN q.quote IS NULL OR q.quote->>'ok'='false' THEN 1 ELSE 0 END,
    CASE WHEN q.quote IS NULL OR q.quote->>'ok'='false' THEN r.base_price ELSE (q.quote->>'total')::numeric END;
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
  IF v_quote->>'ok'='false' THEN
    RAISE EXCEPTION 'StayNas pricing rejected [%]: %',v_quote->>'error_code',v_quote->>'message';
  END IF;
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

-- Keep the adapter internal, matching the SPE-02 RPC privilege boundary.
REVOKE ALL ON FUNCTION public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.calculate_staynas_room_pricing_legacy(uuid,uuid,date,date,integer,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;


COMMIT;
