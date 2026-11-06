-- SPE-04.09 — expose guest-safe, auditable nightly pricing explanations.
BEGIN;

CREATE OR REPLACE FUNCTION public.discover_staynas_public_rate_plans(
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_plan record;
  v_quote jsonb;
  v_results jsonb := '[]'::jsonb;
  v_nightly_explanation jsonb;
BEGIN
  IF _property_id IS NULL OR _room_id IS NULL
     OR _check_in IS NULL OR _check_out IS NULL
     OR _check_out <= _check_in
     OR COALESCE(_adults,0) < 1
     OR COALESCE(_children_below_6,0) < 0
     OR COALESCE(_children_7_plus,0) < 0 THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_DISCOVERY_REQUEST',
      'message','A valid property, room, stay and occupancy are required','plans','[]'::jsonb);
  END IF;

  SELECT r.* INTO v_room
  FROM public.rooms r
  WHERE r.id=_room_id AND r.property_id=_property_id AND r.status='active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error_code','ROOM_NOT_FOUND',
      'message','Room is not available for this property','plans','[]'::jsonb);
  END IF;

  FOR v_plan IN
    SELECT p.id,p.name,p.description,p.meal_plan,p.refundable,p.currency
    FROM public.staynas_rate_plans p
    JOIN public.staynas_rate_plan_room_types a
      ON a.rate_plan_id=p.id AND a.property_id=p.property_id
     AND a.room_type_id=v_room.catalogue_type_id AND a.active=true
    JOIN LATERAL (
      SELECT pub.id,pub.publication_number,pub.effective_from,pub.effective_to
      FROM public.staynas_rate_plan_publications pub
      WHERE pub.property_id=p.property_id AND pub.rate_plan_id=p.id
      ORDER BY pub.publication_number DESC LIMIT 1
    ) latest ON true
    WHERE p.property_id=_property_id AND p.active=true
      AND p.archived_at IS NULL AND p.publication_status='published'
      AND (p.effective_from IS NULL OR p.effective_from<=_check_in)
      AND (p.effective_to IS NULL OR p.effective_to>=(_check_out-1))
      AND (latest.effective_from IS NULL OR latest.effective_from<=_check_in)
      AND (latest.effective_to IS NULL OR latest.effective_to>=(_check_out-1))
    ORDER BY p.name,p.id
  LOOP
    v_quote := public.resolve_staynas_published_room_pricing(
      _property_id,_room_id,_check_in,_check_out,_adults,
      COALESCE(_children_below_6,0),COALESCE(_children_7_plus,0),
      v_plan.id,now()
    );
    IF v_quote->>'ok'='true' THEN
      -- Deliberately whitelist guest-safe fields. Internal override IDs,
      -- room-type identifiers, publication hashes and resolver internals
      -- are not exposed by this public discovery contract.
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date',n.value->'date',
        'nightly_rate',n.value->'nightly_rate',
        'currency',n.value->'currency',
        'source_label',CASE n.value->>'source'
          WHEN 'approved_room_date_override' THEN 'Approved room-specific rate'
          WHEN 'approved_plan_room_type_override' THEN 'Approved plan and room-type rate'
          WHEN 'approved_room_type_override' THEN 'Approved room-type rate'
          WHEN 'approved_plan_override' THEN 'Approved rate-plan adjustment'
          WHEN 'published_daily_rate' THEN 'Published daily rate'
          WHEN 'published_seasonal_rate' THEN 'Published seasonal rate'
          WHEN 'published_occupancy_rate' THEN 'Published occupancy rate'
          WHEN 'published_base_rate' THEN 'Published base rate'
          ELSE 'Published rate'
        END,
        'pricing_basis',n.value->'pricing_basis',
        'source_rate',n.value->'source_rate'
      ) ORDER BY n.ordinality),'[]'::jsonb)
      INTO v_nightly_explanation
      FROM jsonb_array_elements(v_quote->'nightly') WITH ORDINALITY n(value,ordinality);

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rate_plan_id',v_plan.id,
        'name',v_plan.name,
        'description',v_plan.description,
        'meal_plan',v_plan.meal_plan,
        'refundable',v_plan.refundable,
        'currency',upper(v_plan.currency),
        'total',v_quote->'accommodation_subtotal',
        'average_nightly_rate',round((v_quote->>'accommodation_subtotal')::numeric/(v_quote->>'nights')::numeric,2),
        'minimum_stay',v_quote->'minimum_stay',
        'nightly_breakdown',v_nightly_explanation,
        'publication_id',v_quote->'publication_id',
        'publication_number',v_quote->'publication_number',
        'rate_plan_version',v_quote->'rate_plan_version'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'property_id',_property_id,
    'room_id',_room_id,'check_in',_check_in,'check_out',_check_out,
    'currency',COALESCE((v_results->0->>'currency'),upper(v_room.currency)),
    'plans',v_results);
EXCEPTION
  WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('ok',false,'error_code','AUTHORIZATION_DENIED',
      'message','Rate-plan discovery is not authorized','plans','[]'::jsonb);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok',false,'error_code','RATE_PLAN_DISCOVERY_FAILED',
      'message','Eligible rate plans could not be resolved','plans','[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)
  TO service_role;

COMMIT;
