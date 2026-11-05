-- SPE-04.03: strict database validation for canonical base-rate and occupancy JSON.
-- Feature-branch migration only. It is intentionally not applied to UAT or production.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_base_and_occupancy_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_currency text;
  v_base_rates jsonb;
  v_occupancy_rules jsonb;
  v_room_type_key text;
  v_rule_key text;
  v_rate jsonb;
  v_rules jsonb;
  v_room_type_id uuid;
  v_adults integer;
  v_children_below_6 integer;
  v_children_7_plus integer;
  v_seen integer;
BEGIN
  SELECT upper(p.currency)
    INTO v_currency
  FROM public.staynas_properties p
  WHERE p.id=NEW.property_id AND p.status='active';

  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING
      ERRCODE='22023',
      MESSAGE='PROPERTY_CONTEXT_INVALID',
      DETAIL='Rate-plan property must have an explicit valid currency';
  END IF;

  v_base_rates := COALESCE(NEW.rate_plan_data->'base_rates','{}'::jsonb);
  v_occupancy_rules := COALESCE(NEW.rate_plan_data->'occupancy_rules','{}'::jsonb);

  IF jsonb_typeof(v_base_rates) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
      DETAIL='base_rates must be an object keyed by room catalogue type UUID';
  END IF;
  IF jsonb_typeof(v_occupancy_rules) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
      DETAIL='occupancy_rules must be an object keyed by room catalogue type UUID';
  END IF;

  FOR v_room_type_key,v_rate IN SELECT key,value FROM jsonb_each(v_base_rates)
  LOOP
    IF v_room_type_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='base_rates contains an invalid room catalogue type identifier';
    END IF;
    v_room_type_id := v_room_type_key::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.property_id=NEW.property_id AND r.catalogue_type_id=v_room_type_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='base_rates references a room type outside the property catalogue';
    END IF;
    IF jsonb_typeof(v_rate) IS DISTINCT FROM 'object'
       OR v_rate - ARRAY['nightly_rate','currency']::text[] <> '{}'::jsonb
       OR NOT (v_rate ?& ARRAY['nightly_rate','currency']) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='Each base rate must contain only nightly_rate and currency';
    END IF;
    IF jsonb_typeof(v_rate->'nightly_rate') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='Base nightly_rate must be a JSON number';
    END IF;
    BEGIN
      IF (v_rate->>'nightly_rate')::numeric <= 0 THEN
        RAISE EXCEPTION 'non-positive';
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='Base nightly_rate must be a positive decimal';
    END;
    IF jsonb_typeof(v_rate->'currency') IS DISTINCT FROM 'string'
       OR v_rate->>'currency' !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='Base rate currency must be an uppercase ISO-4217 code';
    END IF;
    IF v_rate->>'currency' IS DISTINCT FROM v_currency
       OR upper(NEW.currency) IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CURRENCY_MISMATCH',
        DETAIL='Base rate and rate-plan currency must match the property currency';
    END IF;
  END LOOP;

  FOR v_room_type_key,v_rules IN SELECT key,value FROM jsonb_each(v_occupancy_rules)
  LOOP
    IF v_room_type_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='occupancy_rules contains an invalid room catalogue type identifier';
    END IF;
    v_room_type_id := v_room_type_key::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.property_id=NEW.property_id AND r.catalogue_type_id=v_room_type_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='occupancy_rules references a room type outside the property catalogue';
    END IF;
    IF jsonb_typeof(v_rules) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
        DETAIL='Each occupancy_rules room-type value must be an occupancy-keyed object';
    END IF;

    FOR v_rule_key,v_rate IN SELECT key,value FROM jsonb_each(v_rules)
    LOOP
      IF v_rule_key !~ '^[1-9][0-9]*:[0-9]+:[0-9]+$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
          DETAIL='Occupancy keys must use adults:children_below_6:children_7_plus';
      END IF;
      v_adults := split_part(v_rule_key,':',1)::integer;
      v_children_below_6 := split_part(v_rule_key,':',2)::integer;
      v_children_7_plus := split_part(v_rule_key,':',3)::integer;
      IF v_adults<1 OR v_children_below_6<0 OR v_children_7_plus<0
         OR v_adults+v_children_below_6+v_children_7_plus>30 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
          DETAIL='Occupancy key counts are outside supported bounds';
      END IF;
      IF jsonb_typeof(v_rate) IS DISTINCT FROM 'object'
         OR v_rate - ARRAY['nightly_rate','currency']::text[] <> '{}'::jsonb
         OR NOT (v_rate ?& ARRAY['nightly_rate','currency']) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
          DETAIL='Each occupancy rate must contain only nightly_rate and currency';
      END IF;
      IF jsonb_typeof(v_rate->'nightly_rate') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
          DETAIL='Occupancy nightly_rate must be a JSON number';
      END IF;
      BEGIN
        IF (v_rate->>'nightly_rate')::numeric<=0 THEN
          RAISE EXCEPTION 'non-positive';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
          DETAIL='Occupancy nightly_rate must be a positive decimal';
      END;
      IF jsonb_typeof(v_rate->'currency') IS DISTINCT FROM 'string'
         OR v_rate->>'currency' !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
          DETAIL='Occupancy rate currency must be an uppercase ISO-4217 code';
      END IF;
      IF v_rate->>'currency' IS DISTINCT FROM v_currency THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CURRENCY_MISMATCH',
          DETAIL='Occupancy rate currency must match the property currency';
      END IF;
    END LOOP;
  END LOOP;

  IF NEW.pricing_basis='occupancy_based' AND jsonb_object_length(v_occupancy_rules)=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
      DETAIL='occupancy_based plans require exact occupancy_rules';
  END IF;
  IF NEW.pricing_basis IN ('per_room','per_person')
     AND jsonb_object_length(v_occupancy_rules)>0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_RATE_CONFIGURATION',
      DETAIL='Occupancy overrides for per_room/per_person are not supported until a complete included-occupant and extra-fee contract is implemented';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plans_base_occupancy_guard ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_base_occupancy_guard
  BEFORE INSERT OR UPDATE OF property_id,currency,pricing_basis,rate_plan_data
  ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_base_and_occupancy_data();

REVOKE ALL ON FUNCTION public.validate_staynas_rate_plan_base_and_occupancy_data()
  FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.validate_staynas_rate_plan_base_and_occupancy_data() IS
  'SPE-04.03 strict validation for property-scoped base rates and exact occupancy rate keys. Does not calculate or publish prices.';

COMMIT;
