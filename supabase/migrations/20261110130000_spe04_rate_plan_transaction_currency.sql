-- SPE-04 corrective: transaction currency belongs to the published rate plan,
-- not the property's operating currency. Legacy-only pricing remains unchanged.
BEGIN;
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
  v_jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''), NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role', auth.role());
  v_room public.rooms%ROWTYPE;
  v_property_currency text;
  v_transaction_currency text;
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
  -- Room inventory belongs to the property; published plans own their
  -- independent transaction currency. Legacy fallback retains room currency checks.

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
    IF upper(COALESCE(v_room.currency,''))<>v_property_currency THEN
      RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
        'message','Legacy room currency is inconsistent with property operating currency');
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
      AND x.publication_number=(
        SELECT max(pub2.publication_number)
        FROM public.staynas_rate_plan_publications pub2
        WHERE pub2.property_id=x.property_id AND pub2.rate_plan_id=x.rate_plan_id
      )
    LIMIT 1
  )) AND p.property_id=_property_id AND a.room_type_id=v_room.catalogue_type_id
  LIMIT 1;

  SELECT pub.* INTO v_publication
  FROM public.staynas_rate_plan_publications pub
  WHERE pub.property_id=_property_id AND pub.rate_plan_id=v_plan.id
  ORDER BY pub.publication_number DESC LIMIT 1;
  IF NOT FOUND OR v_publication.snapshot_hash IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error_code','RATE_SOURCE_MISSING',
      'message','Eligible rate plan and latest publication could not be resolved consistently');
  END IF;
  v_transaction_currency := upper(COALESCE(v_plan.currency,''));
  IF upper(COALESCE(v_publication.currency,''))<>v_transaction_currency THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Published rate-plan and immutable publication currencies do not match');
  END IF;
  IF length(v_transaction_currency)<>3 OR v_transaction_currency !~ '^[A-Z]{3}' THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Published rate-plan transaction currency must be a valid ISO 4217 code');
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
    IF upper(v_rate->>'currency') IS DISTINCT FROM v_transaction_currency THEN
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
      'date',v_day,'nightly_rate',v_nightly_rate,'source_rate',v_rate_amount,'currency',v_transaction_currency,
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
    'currency',v_transaction_currency,'operating_currency',v_property_currency,'timezone',v_timezone,
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

COMMIT;
