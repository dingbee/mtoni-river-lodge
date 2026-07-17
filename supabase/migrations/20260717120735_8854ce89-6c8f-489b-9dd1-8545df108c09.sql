-- Sprint 8F: Executive Intelligence tables

CREATE TABLE public.ai_executive_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model text NOT NULL DEFAULT 'deterministic:mtoni-executive-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_executive_briefings_date_idx ON public.ai_executive_briefings (briefing_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_executive_briefings TO authenticated;
GRANT ALL ON public.ai_executive_briefings TO service_role;
ALTER TABLE public.ai_executive_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefings_read_leadership" ON public.ai_executive_briefings FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE POLICY "briefings_write_leadership" ON public.ai_executive_briefings FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE TRIGGER trg_ai_executive_briefings_updated
  BEFORE UPDATE ON public.ai_executive_briefings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- KPI snapshots (weekly/monthly/quarterly/yearly aggregation snapshots)
CREATE TABLE public.ai_executive_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period IN ('week','month','quarter','year')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_executive_kpi_snapshots_key ON public.ai_executive_kpi_snapshots (period, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_executive_kpi_snapshots TO authenticated;
GRANT ALL ON public.ai_executive_kpi_snapshots TO service_role;
ALTER TABLE public.ai_executive_kpi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_snap_read_leadership" ON public.ai_executive_kpi_snapshots FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance','marketing']::public.app_role[]));
CREATE POLICY "kpi_snap_write_leadership" ON public.ai_executive_kpi_snapshots FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- Strategic risks
CREATE TABLE public.ai_strategic_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  reasoning text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  domains text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','mitigated','dismissed')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_strategic_risks_status_idx ON public.ai_strategic_risks (status, severity, detected_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_strategic_risks TO authenticated;
GRANT ALL ON public.ai_strategic_risks TO service_role;
ALTER TABLE public.ai_strategic_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risks_read_leadership" ON public.ai_strategic_risks FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance','marketing']::public.app_role[]));
CREATE POLICY "risks_write_leadership" ON public.ai_strategic_risks FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE TRIGGER trg_ai_strategic_risks_updated
  BEFORE UPDATE ON public.ai_strategic_risks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();