-- StayNas property operating currency identity and property-scoped AI/finance artifacts.
-- Historical rows remain unassigned; no financial values are backfilled or converted.
BEGIN;

ALTER TABLE public.ai_revenue_forecasts ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_revenue_opportunities ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_revenue_alerts ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_pricing_recommendations ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.financial_alerts ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_guest_recommendations ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_guest_alerts ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.analytics_reports ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_trend_snapshots ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_analytics_recommendations ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_executive_briefings ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_recommendations ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_priorities ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_reputation_insights ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_strategic_risks ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_activity_logs ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_executive_kpi_snapshots ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;

-- Currency shape checks permit legacy NULL values but validate all recorded codes.
DO $currency_checks$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_revenue_forecasts','ai_revenue_opportunities','ai_revenue_alerts','ai_pricing_recommendations','financial_alerts','ai_guest_recommendations','analytics_reports','ai_trend_snapshots','ai_analytics_recommendations','ai_executive_briefings','ai_marketing_recommendations','ai_marketing_priorities','ai_executive_kpi_snapshots','campaigns']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I',t)::regclass AND conname = t || '_currency_iso3_chk') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (currency IS NULL OR currency ~ %L)',t,t || '_currency_iso3_chk','^[A-Z]{3}$');
    END IF;
  END LOOP;
END
$currency_checks$;

DROP INDEX IF EXISTS public.ai_executive_briefings_date_idx;
DROP INDEX IF EXISTS public.ai_executive_briefings_property_date_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_executive_briefings_property_currency_date_uidx ON public.ai_executive_briefings(property_id,currency,briefing_date);
DROP INDEX IF EXISTS public.ai_executive_kpi_snapshots_key;
CREATE UNIQUE INDEX IF NOT EXISTS ai_executive_kpi_snapshots_property_period_uidx ON public.ai_executive_kpi_snapshots(property_id,currency,period,period_start);

DO $property_indexes$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_revenue_forecasts','ai_revenue_opportunities','ai_revenue_alerts','ai_pricing_recommendations','financial_alerts','ai_guest_recommendations','ai_guest_alerts','analytics_reports','ai_trend_snapshots','ai_analytics_recommendations','ai_executive_briefings','ai_marketing_recommendations','ai_marketing_priorities','ai_reputation_insights','ai_strategic_risks','ai_activity_logs','ai_executive_kpi_snapshots']
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(property_id,created_at DESC)',t || '_property_created_idx',t);
  END LOOP;
END
$property_indexes$;
CREATE INDEX IF NOT EXISTS campaigns_property_updated_idx ON public.campaigns(property_id,updated_at DESC);

-- Replace the exact permissive legacy policies before creating active-property policies.
DROP POLICY IF EXISTS "Property staff action AI pricing rec" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff create AI pricing rec" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff read AI pricing recom" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Finance manage financial alerts" ON public.financial_alerts;
DROP POLICY IF EXISTS "Managers write reports" ON public.analytics_reports;
DROP POLICY IF EXISTS "Managers write trend_snapshots" ON public.ai_trend_snapshots;
DROP POLICY IF EXISTS "Managers write analytics_recs" ON public.ai_analytics_recommendations;

DO $property_rls$
DECLARE
  t text;
  roles text[];
  role_sql text;
BEGIN
  FOR t, roles IN
    SELECT * FROM (VALUES
      ('ai_revenue_forecasts', ARRAY['owner','manager','finance','admin']),
      ('ai_revenue_opportunities', ARRAY['owner','manager','finance','admin']),
      ('ai_revenue_alerts', ARRAY['owner','manager','finance','admin']),
      ('ai_pricing_recommendations', ARRAY['owner','manager','finance','admin']),
      ('financial_alerts', ARRAY['owner','manager','finance','admin']),
      ('ai_guest_recommendations', ARRAY['owner','manager','admin','reception','marketing','finance']),
      ('ai_guest_alerts', ARRAY['owner','manager','admin','reception']),
      ('analytics_reports', ARRAY['owner','manager','admin']),
      ('ai_trend_snapshots', ARRAY['owner','manager','admin']),
      ('ai_analytics_recommendations', ARRAY['owner','manager','admin']),
      ('ai_executive_briefings', ARRAY['owner','manager','admin']),
      ('ai_marketing_recommendations', ARRAY['owner','manager','admin','marketing']),
      ('ai_marketing_priorities', ARRAY['owner','manager','admin','marketing']),
      ('ai_reputation_insights', ARRAY['owner','manager','admin','marketing']),
      ('ai_strategic_risks', ARRAY['owner','manager','admin','finance']),
      ('ai_activity_logs', ARRAY['owner','manager','admin']),
      ('ai_executive_kpi_snapshots', ARRAY['owner','manager','admin']),
      ('campaigns', ARRAY['owner','manager','admin','marketing'])
    ) AS x(table_name,role_names)
  LOOP
    role_sql := (SELECT string_agg(quote_literal(r),',') FROM unnest(roles) AS r);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS staynas_property_scope ON public.%I',t);
    EXECUTE format(
      'CREATE POLICY staynas_property_scope ON public.%I FOR ALL TO authenticated USING (property_id = public.staynas_active_property_id(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(),property_id) AND public.has_any_role(auth.uid(),ARRAY[%s]::public.app_role[])) WITH CHECK (property_id = public.staynas_active_property_id(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(),property_id) AND public.has_any_role(auth.uid(),ARRAY[%s]::public.app_role[]))',
      t,role_sql,role_sql
    );
  END LOOP;
END
$property_rls$;

GRANT SELECT,INSERT ON public.ai_revenue_forecasts TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_revenue_opportunities TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_revenue_alerts TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_pricing_recommendations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.financial_alerts TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_guest_recommendations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_guest_alerts TO authenticated;
GRANT SELECT,INSERT ON public.analytics_reports TO authenticated;
GRANT SELECT,INSERT ON public.ai_trend_snapshots TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_analytics_recommendations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_executive_briefings TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_marketing_recommendations TO authenticated;
GRANT SELECT,INSERT ON public.ai_marketing_priorities TO authenticated;
GRANT SELECT,INSERT ON public.ai_reputation_insights TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_strategic_risks TO authenticated;
GRANT SELECT,INSERT ON public.ai_activity_logs TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_executive_kpi_snapshots TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaigns TO authenticated;

COMMIT;
