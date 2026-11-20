-- Part 3 of 4 for manual application in the Supabase SQL editor (phone-clipboard sized).
-- Identical statements to supabase/migrations/20261120120000_staynas_currency_integrity.sql.
-- Run parts 1-4 in order; each part is atomic and safe to re-run.
BEGIN;
-- 4. Discovery lists only plans sellable in the property currency.
CREATE OR REPLACE FUNCTION public.discover_staynas_public_rate_plans(_property_id uuid, _room_id uuid, _check_in date, _check_out date, _adults integer, _children_below_6 integer DEFAULT 0, _children_7_plus integer DEFAULT 0)
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
  v_property_currency text;
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

  SELECT upper(p.currency) INTO v_property_currency
  FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active';

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
      AND upper(p.currency)=v_property_currency
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
    'currency',v_property_currency,
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

-- 5. Availability rows carry the currency of the amount they report.
CREATE OR REPLACE FUNCTION public.get_staynas_room_availability_priced(_check_in date, _check_out date, _property_id uuid, _adults integer DEFAULT 1, _children_below_6 integer DEFAULT 0, _children_7_plus integer DEFAULT 0)
 RETURNS TABLE(room_id uuid, slug text, name text, base_price numeric, currency text, capacity_adults integer, capacity_children integer, max_occupancy integer, included_guests integer, extra_guest_fee numeric, nights integer, nightly_total numeric, min_available integer, is_available boolean, fits_occupancy boolean, pricing_quote jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _check_out <= _check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    WHERE p.id = _property_id AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Property is not active or does not exist';
  END IF;

  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_check_in, _check_out - interval '1 day', interval '1 day')::date AS d
  ),
  inventory AS (
    SELECT
      r.id AS room_id,
      dr.d,
      COALESCE(i.available_units, r.total_units) AS configured_units,
      COALESCE(i.is_blocked, false) AS blocked,
      (
        SELECT COUNT(*)::integer
        FROM public.room_states rs
        WHERE rs.room_id = r.id
          AND rs.property_id = r.property_id
          AND rs.booking_id IS NULL
          AND rs.state::text IN ('vacant_dirty', 'inspection', 'maintenance', 'out_of_service')
      ) AS operational_blocks,
      (
        SELECT COUNT(*)::integer
        FROM public.booking_holds h
        WHERE h.room_id = r.id
          AND h.status = 'active'
          AND h.expires_at > now()
          AND h.check_in <= dr.d
          AND h.check_out > dr.d
      ) AS hold_count
    FROM public.rooms r
    CROSS JOIN date_range dr
    LEFT JOIN public.room_inventory i
      ON i.room_id = r.id AND i.date = dr.d
    WHERE r.property_id = _property_id AND r.status = 'active'
  ),
  stock AS (
    SELECT
      inventory.room_id,
      MIN(GREATEST(
        configured_units - LEAST(configured_units, operational_blocks) - hold_count,
        0
      ))::integer AS min_units,
      BOOL_AND(
        NOT blocked
        AND configured_units - LEAST(configured_units, operational_blocks) - hold_count > 0
      ) AS available
    FROM inventory
    GROUP BY inventory.room_id
  )
  SELECT
    r.id,
    r.slug,
    r.name,
    -- Indicative legacy base price is only returned when it is denominated in the
    -- property currency; the row currency is the priced quote currency.
    CASE WHEN upper(r.currency)=pc.currency THEN r.base_price ELSE NULL END,
    COALESCE(NULLIF(upper(q.quote->>'currency'),''),pc.currency),
    r.capacity_adults,
    r.capacity_children,
    r.max_occupancy,
    r.included_guests,
    r.extra_guest_fee,
    (_check_out - _check_in),
    CASE
      WHEN q.quote IS NULL OR q.quote->>'ok'='false' THEN 0
      ELSE (q.quote->>'total')::numeric
    END,
    COALESCE(s.min_units, 0),
    (
      COALESCE(s.available, false)
      AND q.quote IS NOT NULL
      AND q.quote->>'ok' IS DISTINCT FROM 'false'
    ),
    (
      _adults <= r.capacity_adults
      AND (_children_below_6 + _children_7_plus) <= r.capacity_children
      AND (_adults + _children_below_6 + _children_7_plus) <= r.max_occupancy
    ),
    q.quote
  FROM public.rooms r
  CROSS JOIN LATERAL (SELECT upper(p.currency) AS currency FROM public.staynas_properties p WHERE p.id=_property_id) pc
  LEFT JOIN stock s ON s.room_id = r.id
  LEFT JOIN LATERAL (
    SELECT public.try_calculate_staynas_booking_quote(
      _property_id,
      r.id,
      _check_in,
      _check_out,
      _adults,
      _children_below_6,
      _children_7_plus
    ) AS quote
    WHERE _adults <= r.capacity_adults
      AND (_children_below_6 + _children_7_plus) <= r.capacity_children
      AND (_adults + _children_below_6 + _children_7_plus) <= r.max_occupancy
  ) q ON true
  WHERE r.property_id = _property_id AND r.status = 'active'
  ORDER BY
    CASE WHEN q.quote IS NULL OR q.quote->>'ok'='false' THEN 1 ELSE 0 END,
    CASE
      WHEN q.quote IS NULL OR q.quote->>'ok'='false' THEN r.base_price
      ELSE (q.quote->>'total')::numeric
    END;
END;
$function$;

COMMIT;
select 'currency integrity part 3 of 4 applied' as status;
