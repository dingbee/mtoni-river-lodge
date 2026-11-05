
-- 1. analytics_snapshots
CREATE TABLE public.analytics_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  value NUMERIC,
  value_text TEXT,
  period TEXT NOT NULL DEFAULT 'daily',
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_snapshots_domain_metric ON public.analytics_snapshots(domain, metric, period_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_snapshots TO authenticated;
GRANT ALL ON public.analytics_snapshots TO service_role;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read analytics_snapshots" ON public.analytics_snapshots FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers can write analytics_snapshots" ON public.analytics_snapshots FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- 2. analytics_reports
CREATE TABLE public.analytics_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  generated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_reports_kind_period ON public.analytics_reports(kind, period_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_reports TO authenticated;
GRANT ALL ON public.analytics_reports TO service_role;
ALTER TABLE public.analytics_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read reports" ON public.analytics_reports FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers write reports" ON public.analytics_reports FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- 3. analytics_dashboards
CREATE TABLE public.analytics_dashboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'shared',
  owner_id UUID REFERENCES auth.users(id),
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_dashboards TO authenticated;
GRANT ALL ON public.analytics_dashboards TO service_role;
ALTER TABLE public.analytics_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read dashboards" ON public.analytics_dashboards FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers write dashboards" ON public.analytics_dashboards FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- 4. analytics_widgets
CREATE TABLE public.analytics_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES public.analytics_dashboards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_widgets_dashboard ON public.analytics_widgets(dashboard_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_widgets TO authenticated;
GRANT ALL ON public.analytics_widgets TO service_role;
ALTER TABLE public.analytics_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read widgets" ON public.analytics_widgets FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers write widgets" ON public.analytics_widgets FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- 5. ai_trend_snapshots
CREATE TABLE public.ai_trend_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_value NUMERIC,
  previous_value NUMERIC,
  delta_pct NUMERIC,
  direction TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_trend_snapshots_domain ON public.ai_trend_snapshots(domain, metric, window_days, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_trend_snapshots TO authenticated;
GRANT ALL ON public.ai_trend_snapshots TO service_role;
ALTER TABLE public.ai_trend_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read trend_snapshots" ON public.ai_trend_snapshots FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers write trend_snapshots" ON public.ai_trend_snapshots FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- 6. ai_analytics_recommendations
CREATE TABLE public.ai_analytics_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  reasoning TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  impact TEXT,
  suggested_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_analytics_recs_status ON public.ai_analytics_recommendations(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_analytics_recommendations TO authenticated;
GRANT ALL ON public.ai_analytics_recommendations TO service_role;
ALTER TABLE public.ai_analytics_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read analytics_recs" ON public.ai_analytics_recommendations FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers write analytics_recs" ON public.ai_analytics_recommendations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- updated_at triggers
CREATE TRIGGER trg_analytics_snapshots_updated_at BEFORE UPDATE ON public.analytics_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_analytics_reports_updated_at BEFORE UPDATE ON public.analytics_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_analytics_dashboards_updated_at BEFORE UPDATE ON public.analytics_dashboards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_analytics_widgets_updated_at BEFORE UPDATE ON public.analytics_widgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ai_trend_snapshots_updated_at BEFORE UPDATE ON public.ai_trend_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ai_analytics_recs_updated_at BEFORE UPDATE ON public.ai_analytics_recommendations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
