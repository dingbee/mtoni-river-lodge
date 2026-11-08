-- SPE-08 property-scoped pricing intelligence database contracts.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staynas_pricing_intelligence_runs',
    'staynas_pricing_recommendations',
    'staynas_pricing_recommendation_events',
    'staynas_pricing_forecasts',
    'staynas_pricing_scenarios',
    'staynas_competitor_observations'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'SPE-08 required table missing: %', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.' || t)) THEN
      RAISE EXCEPTION 'SPE-08 RLS is not enabled: %', t;
    END IF;
    IF has_table_privilege('anon','public.' || t,'SELECT') THEN
      RAISE EXCEPTION 'SPE-08 anonymous read privilege unexpectedly exists: %', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND policyname=t || '_property_read'
        AND qual LIKE '%staynas_user_has_property_access%'
    ) THEN
      RAISE EXCEPTION 'SPE-08 property read policy missing or unscoped: %', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.staynas_pricing_recommendations'::regclass
      AND tgname='staynas_pi_recommendation_transition_guard' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'Recommendation transition guard missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.staynas_pricing_recommendation_events'::regclass
      AND tgname='staynas_pi_events_immutable' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'Append-only recommendation audit guard missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_pricing_forecasts' AND column_name='method_version'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_pricing_forecasts' AND column_name='data_coverage'
  ) THEN RAISE EXCEPTION 'Forecast version/coverage metadata missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_pricing_recommendations' AND column_name='explanation'
  ) THEN RAISE EXCEPTION 'Recommendation explanation column missing'; END IF;

  IF has_table_privilege('authenticated','public.staynas_pricing_recommendation_events','DELETE') THEN
    RAISE EXCEPTION 'Authenticated users must not delete recommendation audit history';
  END IF;
END $$;
