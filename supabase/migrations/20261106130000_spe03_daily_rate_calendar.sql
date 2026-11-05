-- SPE-03.06: property-scoped daily rate calendar integrity.
-- UAT migration only. Exact-date overrides are evaluated ahead of seasonal/base rates by SPE-04.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_daily_rates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_currency text;
  v_seasons_timezone text;
  v_daily_rates jsonb;
  v_parent_resolved jsonb;
  v_date_key text;
  v_date_rates jsonb;
  v_room_type_key text;
  v_rate jsonb;
  v_room_type_id uuid;
  v_stay_date date;
BEGIN
  SELECT upper(currency), timezone
    INTO v_currency, v_seasons_timezone
  FROM public.staynas_properties
  WHERE id = NEW.property_id;

  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Daily pricing requires an explicit property currency';
  END IF;
  IF v_seasons_timezone IS NULL OR length(trim(v_seasons_timezone)) = 0 THEN
    RAISE EXCEPTION 'Daily pricing requires an explicit property timezone';
  END IF;

  v_daily_rates := COALESCE(NEW.rate_plan_data->'daily_rates', '{}'::jsonb);
  IF jsonb_typeof(v_daily_rates) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'daily_rates must be a date-keyed JSON object';
  END IF;

  IF NEW.parent_rate_plan_id IS NOT NULL THEN
    v_parent_resolved := public.resolve_staynas_rate_plan_inheritance(
      NEW.property_id, NEW.parent_rate_plan_id
    );
    v_daily_rates := public.staynas_rate_plan_jsonb_deep_merge(
      COALESCE(v_parent_resolved->'resolved_data'->'daily_rates', '{}'::jsonb),
      v_daily_rates
    );
  END IF;

  FOR v_date_key, v_date_rates IN SELECT key, value FROM jsonb_each(v_daily_rates)
  LOOP
    IF v_date_rates = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    IF v_date_key !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Daily rate key % must be an ISO calendar date', v_date_key;
    END IF;
    BEGIN
      v_stay_date := v_date_key::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Daily rate key % is not a valid calendar date', v_date_key;
    END;
    IF jsonb_typeof(v_date_rates) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Daily rate date % must contain a room-type keyed object or null', v_date_key;
    END IF;

    FOR v_room_type_key, v_rate IN SELECT key, value FROM jsonb_each(v_date_rates)
    LOOP
      IF v_rate = 'null'::jsonb THEN
        CONTINUE;
      END IF;
      IF v_room_type_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Daily rate on % has an invalid room-type identifier', v_date_key;
      END IF;
      v_room_type_id := v_room_type_key::uuid;
      IF jsonb_typeof(v_rate) IS DISTINCT FROM 'object'
         OR v_rate - ARRAY['nightly_rate','currency','active']::text[] <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Daily rate for room type % on % has an invalid shape', v_room_type_key, v_date_key;
      END IF;
      IF jsonb_typeof(v_rate->'nightly_rate') IS DISTINCT FROM 'number'
         OR (v_rate->>'nightly_rate')::numeric <= 0 THEN
        RAISE EXCEPTION 'Daily rate for room type % on % must be positive', v_room_type_key, v_date_key;
      END IF;
      IF v_rate->>'currency' IS DISTINCT FROM v_currency THEN
        RAISE EXCEPTION 'Daily rate currency on % must match property currency %', v_date_key, v_currency;
      END IF;
      IF jsonb_typeof(v_rate->'active') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Daily rate active flag on % must be a boolean', v_date_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.property_id = NEW.property_id
          AND r.catalogue_type_id = v_room_type_id
      ) THEN
        RAISE EXCEPTION 'Daily rate on % references a room type outside the property catalogue', v_date_key;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plans_daily_rates_guard ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_daily_rates_guard
  BEFORE INSERT OR UPDATE OF property_id, parent_rate_plan_id, rate_plan_data, publication_status
  ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_daily_rates();

REVOKE ALL ON FUNCTION public.validate_staynas_rate_plan_daily_rates() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_staynas_rate_plan_daily_rates() IS
  'Validates inherited daily rate calendar dates, positive nightly rates, property currency and property room catalogue scope.';

COMMIT;
