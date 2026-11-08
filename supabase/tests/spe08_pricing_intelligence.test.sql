-- SPE-08 property-scoped pricing intelligence database contracts.
BEGIN;
SELECT plan(22);

SELECT has_table('public','staynas_pricing_intelligence_runs','Analytics run evidence table exists');
SELECT has_table('public','staynas_pricing_recommendations','Recommendation lifecycle table exists');
SELECT has_table('public','staynas_pricing_recommendation_events','Recommendation audit table exists');
SELECT has_table('public','staynas_pricing_forecasts','Forecast history table exists');
SELECT has_table('public','staynas_pricing_scenarios','Scenario history table exists');
SELECT has_table('public','staynas_competitor_observations','Source-attributed market observation table exists');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_pricing_intelligence_runs'::regclass),'Analytics runs enforce RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_pricing_recommendations'::regclass),'Recommendations enforce RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_pricing_recommendation_events'::regclass),'Recommendation audit enforces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_pricing_forecasts'::regclass),'Forecasts enforce RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_pricing_scenarios'::regclass),'Scenarios enforce RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_competitor_observations'::regclass),'Competitor observations enforce RLS');

SELECT ok(NOT has_table_privilege('anon','public.staynas_pricing_recommendations','SELECT'),'Anonymous users cannot read recommendations');
SELECT ok(NOT has_table_privilege('anon','public.staynas_pricing_forecasts','SELECT'),'Anonymous users cannot read forecasts');
SELECT ok(NOT has_table_privilege('anon','public.staynas_pricing_scenarios','SELECT'),'Anonymous users cannot read scenarios');

SELECT has_trigger('public','staynas_pricing_recommendations','staynas_pi_recommendation_transition_guard','Recommendation evidence and status transitions are guarded');
SELECT has_trigger('public','staynas_pricing_recommendation_events','staynas_pi_events_immutable','Recommendation audit events are append-only');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staynas_pricing_recommendations'
    AND policyname='staynas_pricing_recommendations_property_read'
    AND qual LIKE '%staynas_user_has_property_access%'),
  'Recommendation reads are scoped through property membership'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staynas_pricing_forecasts'
    AND policyname='staynas_pricing_forecasts_property_read'
    AND qual LIKE '%staynas_user_has_property_access%'),
  'Forecast reads are scoped through property membership'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staynas_competitor_observations'
    AND policyname='staynas_competitor_observations_property_read'
    AND qual LIKE '%staynas_user_has_property_access%'),
  'Competitor observations are scoped through property membership'
);

SELECT has_column('public','staynas_pricing_forecasts','method_version','Forecasts preserve method version');
SELECT has_column('public','staynas_pricing_forecasts','data_coverage','Forecasts preserve input coverage');
SELECT has_column('public','staynas_pricing_recommendations','explanation','Recommendations preserve explainability evidence');

SELECT * FROM finish();
ROLLBACK;
