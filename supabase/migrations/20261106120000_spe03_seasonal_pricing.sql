-- SPE-03.05: validate inherited seasonal pricing at the database boundary.
-- Development/UAT migration only. No production application is authorized.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_seasonal_rates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_currency text;
  v_timezone text;
  v_seasons jsonb;
  v_parent_resolved jsonb;
  v_key text;
  v_season jsonb;
  v_room_type_id uuid;
  v_start_date date;
  v_end_date date;
  v_left record;
  v_right record;
BEGIN
  SELECT upper(currency),timezone
    INTO v_currency,v_timezone
  FROM public.staynas_properties
  WHERE id=NEW.property_id;

  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Seasonal pricing requires an explicit property currency';
  END IF;
  IF v_timezone IS NULL OR length(trim(v_timezone))=0 THEN
    RAISE EXCEPTION 'Seasonal pricing requires an explicit property timezone';
  END IF;

  v_seasons := COALESCE(NEW.rate_plan_data->'seasonal_rates','{}'::jsonb);
  IF jsonb_typeof(v_seasons)<>'object' THEN
    RAISE EXCEPTION 'seasonal_rates must be a keyed JSON object';
  END IF;

  -- Validate the effective inherited season set, not just the child's local keys.
  IF NEW.parent_rate_plan_id IS NOT NULL THEN
    v_parent_resolved := public.resolve_staynas_rate_plan_inheritance(
      NEW.property_id,NEW.parent_rate_plan_id
    );
    v_seasons := public.staynas_rate_plan_jsonb_deep_merge(
      COALESCE(v_parent_resolved->'resolved_data'->'seasonal_rates','{}'::jsonb),
      v_seasons
    );
  END IF;

  FOR v_key,v_season IN SELECT key,value FROM jsonb_each(v_seasons)
  LOOP
    IF v_season='null'::jsonb THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_season)<>'object' THEN
      RAISE EXCEPTION 'Season % must be a JSON object or null to clear an inherited season',v_key;
    END IF;
    IF v_season - ARRAY[
      'name','description','season_type','start_date','end_date','room_type_ids',
      'currency','nightly_rate','priority','active'
    ]::text[] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Season % contains unsupported fields',v_key;
    END IF;
    IF jsonb_typeof(v_season->'name')<>'string'
       OR length(trim(v_season->>'name')) NOT BETWEEN 2 AND 100 THEN
      RAISE EXCEPTION 'Season % requires a name between 2 and 100 characters',v_key;
    END IF;
    IF jsonb_typeof(COALESCE(v_season->'description','""'::jsonb))<>'string'
       OR length(v_season->>'description')>1000 THEN
      RAISE EXCEPTION 'Season % description must be text up to 1000 characters',v_key;
    END IF;
    IF v_season->>'season_type' NOT IN ('low','shoulder','high','peak','festive','event','custom') THEN
      RAISE EXCEPTION 'Season % has an unsupported season type',v_key;
    END IF;
    IF jsonb_typeof(v_season->'start_date')<>'string'
       OR (v_season->>'start_date') !~ '^\d{4}-\d{2}-\d{2}$'
       OR jsonb_typeof(v_season->'end_date')<>'string'
       OR (v_season->>'end_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Season % requires ISO calendar start and end dates',v_key;
    END IF;
    BEGIN
      v_start_date := (v_season->>'start_date')::date;
      v_end_date := (v_season->>'end_date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Season % contains an invalid calendar date',v_key;
    END;
    IF v_end_date<v_start_date THEN
      RAISE EXCEPTION 'Season % end date must be on or after its start date',v_key;
    END IF;
    IF jsonb_typeof(v_season->'room_type_ids')<>'array'
       OR jsonb_array_length(v_season->'room_type_ids')=0 THEN
      RAISE EXCEPTION 'Season % requires at least one room type',v_key;
    END IF;
    IF v_season->>'currency' IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'Season % currency must match property currency %',v_key,v_currency;
    END IF;
    IF jsonb_typeof(v_season->'nightly_rate')<>'number'
       OR (v_season->>'nightly_rate')::numeric<=0 THEN
      RAISE EXCEPTION 'Season % nightly rate must be a positive number',v_key;
    END IF;
    IF jsonb_typeof(v_season->'priority')<>'number'
       OR (v_season->>'priority')::numeric<0
       OR trunc((v_season->>'priority')::numeric)<>(v_season->>'priority')::numeric
       OR (v_season->>'priority')::numeric>10000 THEN
      RAISE EXCEPTION 'Season % priority must be a whole number from 0 to 10000',v_key;
    END IF;
    IF jsonb_typeof(v_season->'active')<>'boolean' THEN
      RAISE EXCEPTION 'Season % active must be a boolean',v_key;
    END IF;

    FOR v_room_type_id IN
      SELECT value::uuid FROM jsonb_array_elements_text(v_season->'room_type_ids')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.property_id=NEW.property_id
          AND r.catalogue_type_id=v_room_type_id
      ) THEN
        RAISE EXCEPTION 'Season % references a room type outside the property catalogue',v_key;
      END IF;
    END LOOP;
  END LOOP;

  -- Inclusive date overlap for the same room type is allowed only when
  -- priorities differ. The resolver uses the greatest priority value.
  FOR v_left IN
    SELECT key,value FROM jsonb_each(v_seasons)
    WHERE value<>'null'::jsonb AND value->>'active'='true'
  LOOP
    FOR v_right IN
      SELECT key,value FROM jsonb_each(v_seasons)
      WHERE key>v_left.key AND value<>'null'::jsonb AND value->>'active'='true'
    LOOP
      IF (v_left.value->>'start_date')::date <= (v_right.value->>'end_date')::date
         AND (v_right.value->>'start_date')::date <= (v_left.value->>'end_date')::date
         AND (v_left.value->>'priority')::integer = (v_right.value->>'priority')::integer
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(v_left.value->'room_type_ids') l
           JOIN jsonb_array_elements_text(v_right.value->'room_type_ids') r
             ON l.value=r.value
         ) THEN
        RAISE EXCEPTION 'Active seasons % and % overlap for a room type and require different priorities',
          v_left.key,v_right.key;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plans_seasonal_rates_guard ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_seasonal_rates_guard
  BEFORE INSERT OR UPDATE OF property_id,parent_rate_plan_id,rate_plan_data
  ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_seasonal_rates();

COMMENT ON FUNCTION public.validate_staynas_rate_plan_seasonal_rates() IS
  'Validates effective inherited seasonal rate entries, property currency/timezone, room catalogue scope, date boundaries and deterministic priority conflict rules.';

COMMIT;
