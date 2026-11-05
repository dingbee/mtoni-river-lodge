-- SPE-03.08: validate inherited rate-plan restrictions without touching inventory.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_rules jsonb;
  v_parent_resolved jsonb;
  v_key text;
  v_rule jsonb;
  v_type text;
  v_start date;
  v_end date;
  v_room_type uuid;
  v_value numeric;
  v_left record;
  v_right record;
BEGIN
  v_rules := COALESCE(NEW.rate_plan_data->'restrictions','{}'::jsonb);
  IF jsonb_typeof(v_rules) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'restrictions must be a keyed JSON object';
  END IF;

  IF NEW.parent_rate_plan_id IS NOT NULL THEN
    v_parent_resolved := public.resolve_staynas_rate_plan_inheritance(
      NEW.property_id,NEW.parent_rate_plan_id
    );
    v_rules := public.staynas_rate_plan_jsonb_deep_merge(
      COALESCE(v_parent_resolved->'resolved_data'->'restrictions','{}'::jsonb),
      v_rules
    );
  END IF;

  FOR v_key,v_rule IN SELECT key,value FROM jsonb_each(v_rules)
  LOOP
    IF v_rule='null'::jsonb THEN CONTINUE; END IF;
    IF v_key !~ '^[A-Za-z0-9_-]{2,80}$' THEN
      RAISE EXCEPTION 'Restriction key % must use 2-80 letters, numbers, underscores or hyphens',v_key;
    END IF;
    IF jsonb_typeof(v_rule) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Restriction % must be an object or null to clear an inherited rule',v_key;
    END IF;
    IF v_rule - ARRAY[
      'type','value','start_date','end_date','room_type_ids','active','reason'
    ]::text[] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Restriction % contains unsupported fields',v_key;
    END IF;

    v_type := v_rule->>'type';
    IF v_type NOT IN (
      'min_los','max_los','closed_to_arrival','closed_to_departure',
      'stop_sell','advance_booking_min_hours','advance_booking_max_days'
    ) THEN
      RAISE EXCEPTION 'Restriction % has an unsupported type',v_key;
    END IF;
    IF jsonb_typeof(v_rule->'start_date') IS DISTINCT FROM 'string'
       OR (v_rule->>'start_date') !~ '^\d{4}-\d{2}-\d{2}$'
       OR jsonb_typeof(v_rule->'end_date') IS DISTINCT FROM 'string'
       OR (v_rule->>'end_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Restriction % requires ISO calendar start and end dates',v_key;
    END IF;
    BEGIN
      v_start := (v_rule->>'start_date')::date;
      v_end := (v_rule->>'end_date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Restriction % contains an invalid calendar date',v_key;
    END;
    IF v_end<v_start THEN
      RAISE EXCEPTION 'Restriction % end date must be on or after its start date',v_key;
    END IF;
    IF NEW.effective_from IS NOT NULL AND v_start<NEW.effective_from THEN
      RAISE EXCEPTION 'Restriction % starts before the rate plan effective period',v_key;
    END IF;
    IF NEW.effective_to IS NOT NULL AND v_end>NEW.effective_to THEN
      RAISE EXCEPTION 'Restriction % ends after the rate plan effective period',v_key;
    END IF;

    IF jsonb_typeof(v_rule->'room_type_ids') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_rule->'room_type_ids')=0 THEN
      RAISE EXCEPTION 'Restriction % requires at least one room type',v_key;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_rule->'room_type_ids') AS ids(value)
      WHERE value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'Restriction % contains an invalid room type identifier',v_key;
    END IF;
    IF (SELECT count(*)<>count(DISTINCT value)
        FROM jsonb_array_elements_text(v_rule->'room_type_ids') AS ids(value)) THEN
      RAISE EXCEPTION 'Restriction % contains duplicate room type identifiers',v_key;
    END IF;
    IF jsonb_typeof(v_rule->'active') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Restriction % active must be a boolean',v_key;
    END IF;
    IF jsonb_typeof(v_rule->'reason') IS DISTINCT FROM 'string'
       OR length(trim(v_rule->>'reason')) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'Restriction % requires a reason between 5 and 500 characters',v_key;
    END IF;

    IF v_type IN ('min_los','max_los','advance_booking_min_hours','advance_booking_max_days') THEN
      IF jsonb_typeof(v_rule->'value') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Restriction % requires a numeric value',v_key;
      END IF;
      v_value := (v_rule->>'value')::numeric;
      IF trunc(v_value)<>v_value THEN
        RAISE EXCEPTION 'Restriction % value must be a whole number',v_key;
      END IF;
      IF v_type IN ('min_los','max_los') AND v_value NOT BETWEEN 1 AND 365 THEN
        RAISE EXCEPTION 'Restriction % LOS value must be between 1 and 365 nights',v_key;
      END IF;
      IF v_type='advance_booking_min_hours' AND v_value NOT BETWEEN 0 AND 87600 THEN
        RAISE EXCEPTION 'Restriction % minimum advance hours must be between 0 and 87600',v_key;
      END IF;
      IF v_type='advance_booking_max_days' AND v_value NOT BETWEEN 0 AND 3650 THEN
        RAISE EXCEPTION 'Restriction % maximum advance days must be between 0 and 3650',v_key;
      END IF;
    ELSIF v_rule ? 'value' THEN
      RAISE EXCEPTION 'Restriction % type % must not include a value',v_key,v_type;
    END IF;

    FOR v_room_type IN
      SELECT value::uuid FROM jsonb_array_elements_text(v_rule->'room_type_ids') AS ids(value)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.property_id=NEW.property_id AND r.catalogue_type_id=v_room_type
      ) THEN
        RAISE EXCEPTION 'Restriction % references a room type outside the property catalogue',v_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.staynas_rate_plan_room_types a
        WHERE a.property_id=NEW.property_id
          AND a.rate_plan_id=NEW.id
          AND a.room_type_id=v_room_type
          AND a.active=true
      ) AND NEW.id IS NOT NULL THEN
        RAISE EXCEPTION 'Restriction % room type must be actively assigned to this rate plan',v_key;
      END IF;
    END LOOP;
  END LOOP;

  -- Prevent contradictory minimum/maximum LOS rules for intersecting
  -- room types and arrival-date windows. Other rules remain composable.
  FOR v_left IN
    SELECT key,value FROM jsonb_each(v_rules)
    WHERE value<>'null'::jsonb AND value->>'active'='true' AND value->>'type'='min_los'
  LOOP
    FOR v_right IN
      SELECT key,value FROM jsonb_each(v_rules)
      WHERE value<>'null'::jsonb AND value->>'active'='true' AND value->>'type'='max_los'
    LOOP
      IF (v_left.value->>'value')::integer > (v_right.value->>'value')::integer
         AND daterange((v_left.value->>'start_date')::date,(v_left.value->>'end_date')::date,'[]')
             && daterange((v_right.value->>'start_date')::date,(v_right.value->>'end_date')::date,'[]')
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(v_left.value->'room_type_ids') l(value)
           JOIN jsonb_array_elements_text(v_right.value->'room_type_ids') r(value)
             ON l.value=r.value
         ) THEN
        RAISE EXCEPTION 'Minimum LOS restriction % exceeds overlapping maximum LOS restriction %',v_left.key,v_right.key;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_staynas_rate_plan_restrictions() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_rate_plan_restrictions_validate ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plan_restrictions_validate
  BEFORE INSERT OR UPDATE OF property_id,parent_rate_plan_id,rate_plan_data,effective_from,effective_to,publication_status
  ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_restrictions();

COMMENT ON FUNCTION public.validate_staynas_rate_plan_restrictions() IS
  'Validates effective inherited stay restrictions. Stop-sell and closure restrictions are commercial availability rules and never mutate room_inventory.';

COMMIT;
