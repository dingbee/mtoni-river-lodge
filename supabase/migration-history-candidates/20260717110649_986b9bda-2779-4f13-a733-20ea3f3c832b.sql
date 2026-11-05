
-- Revenue Intelligence AI tables (Sprint 8D)

CREATE TABLE public.ai_revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon_days integer NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  expected_revenue numeric NOT NULL DEFAULT 0,
  expected_occupancy numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0.5,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_revenue_forecasts TO authenticated;
GRANT ALL ON public.ai_revenue_forecasts TO service_role;
ALTER TABLE public.ai_revenue_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revenue forecasts read"
  ON public.ai_revenue_forecasts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance','reception','marketing']::public.app_role[]));
CREATE POLICY "revenue forecasts write"
  ON public.ai_revenue_forecasts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

CREATE TABLE public.ai_pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  window_from date NOT NULL,
  window_to date NOT NULL,
  action text NOT NULL CHECK (action IN ('increase','decrease','hold','promotion','package')),
  current_rate numeric,
  suggested_rate numeric,
  delta_pct numeric,
  reasoning text NOT NULL,
  expected_impact numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed','converted')),
  actioned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actioned_at timestamptz,
  action_task_id uuid,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_pricing_recommendations TO authenticated;
GRANT ALL ON public.ai_pricing_recommendations TO service_role;
ALTER TABLE public.ai_pricing_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing recs read"
  ON public.ai_pricing_recommendations FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
CREATE POLICY "pricing recs write"
  ON public.ai_pricing_recommendations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
CREATE TRIGGER trg_ai_pricing_recs_updated_at BEFORE UPDATE ON public.ai_pricing_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_revenue_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  detail text,
  estimated_impact numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_action text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed','converted')),
  actioned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actioned_at timestamptz,
  action_task_id uuid,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_revenue_opportunities TO authenticated;
GRANT ALL ON public.ai_revenue_opportunities TO service_role;
ALTER TABLE public.ai_revenue_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revenue opps read"
  ON public.ai_revenue_opportunities FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance','marketing']::public.app_role[]));
CREATE POLICY "revenue opps write"
  ON public.ai_revenue_opportunities FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
CREATE TRIGGER trg_ai_rev_opps_updated_at BEFORE UPDATE ON public.ai_revenue_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_revenue_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL,
  detail text,
  metric jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','converted','resolved')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actioned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actioned_at timestamptz,
  action_task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_revenue_alerts TO authenticated;
GRANT ALL ON public.ai_revenue_alerts TO service_role;
ALTER TABLE public.ai_revenue_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revenue alerts read"
  ON public.ai_revenue_alerts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance','reception']::public.app_role[]));
CREATE POLICY "revenue alerts write"
  ON public.ai_revenue_alerts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
CREATE TRIGGER trg_ai_rev_alerts_updated_at BEFORE UPDATE ON public.ai_revenue_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX ai_rev_forecasts_created_idx ON public.ai_revenue_forecasts(created_at DESC);
CREATE INDEX ai_pricing_recs_status_idx ON public.ai_pricing_recommendations(status, created_at DESC);
CREATE INDEX ai_rev_opps_status_idx ON public.ai_revenue_opportunities(status, created_at DESC);
CREATE INDEX ai_rev_alerts_status_idx ON public.ai_revenue_alerts(status, created_at DESC);
