-- Sprint 5 — Decision & Planning Intelligence
CREATE TABLE IF NOT EXISTS public.intelligence_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  domain text NOT NULL,
  decision_key text NOT NULL,
  title text NOT NULL,
  trigger text NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','rejected','modified','executing','completed','failed','expired')),
  risk_level public.intel_severity NOT NULL DEFAULT 'low',
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  requires_approval boolean NOT NULL DEFAULT true,
  recommended_option_key text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  criteria_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions text[] NOT NULL DEFAULT '{}',
  uncertainties text[] NOT NULL DEFAULT '{}',
  risks text[] NOT NULL DEFAULT '{}',
  reasoning_sources text[] NOT NULL DEFAULT '{}',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  prediction_ids uuid[] NOT NULL DEFAULT '{}',
  insight_ids uuid[] NOT NULL DEFAULT '{}',
  recommendation_id uuid REFERENCES public.intelligence_recommendations(id) ON DELETE SET NULL,
  action_id uuid REFERENCES public.intelligence_actions(id) ON DELETE SET NULL,
  outcome jsonb,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_decisions_key_uniq
  ON public.intelligence_decisions (module, decision_key);
CREATE INDEX IF NOT EXISTS idx_intel_decisions_status
  ON public.intelligence_decisions (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.intelligence_decisions TO authenticated;
GRANT ALL ON public.intelligence_decisions TO service_role;
ALTER TABLE public.intelligence_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_decisions_staff_read" ON public.intelligence_decisions
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_decisions_staff_insert" ON public.intelligence_decisions
  FOR INSERT TO authenticated WITH CHECK (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_decisions_manager_update" ON public.intelligence_decisions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "intel_decisions_service_all" ON public.intelligence_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_intel_decisions_updated BEFORE UPDATE ON public.intelligence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.intelligence_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.intelligence_decisions(id) ON DELETE CASCADE,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','in_progress','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_plans_decision_uniq
  ON public.intelligence_plans (decision_id);
GRANT SELECT, INSERT, UPDATE ON public.intelligence_plans TO authenticated;
GRANT ALL ON public.intelligence_plans TO service_role;
ALTER TABLE public.intelligence_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_plans_staff_read" ON public.intelligence_plans
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_plans_staff_insert" ON public.intelligence_plans
  FOR INSERT TO authenticated WITH CHECK (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_plans_manager_update" ON public.intelligence_plans
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "intel_plans_service_all" ON public.intelligence_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_intel_plans_updated BEFORE UPDATE ON public.intelligence_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.intelligence_plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.intelligence_plans(id) ON DELETE CASCADE,
  sequence smallint NOT NULL,
  title text NOT NULL,
  objective text NOT NULL,
  module public.intel_module NOT NULL,
  responsible_role text,
  depends_on smallint,
  requires_approval boolean NOT NULL DEFAULT false,
  expected_outcome text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','blocked','in_progress','done','skipped')),
  note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_plan_steps_seq_uniq
  ON public.intelligence_plan_steps (plan_id, sequence);
GRANT SELECT, INSERT, UPDATE ON public.intelligence_plan_steps TO authenticated;
GRANT ALL ON public.intelligence_plan_steps TO service_role;
ALTER TABLE public.intelligence_plan_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_plan_steps_staff_read" ON public.intelligence_plan_steps
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_plan_steps_staff_insert" ON public.intelligence_plan_steps
  FOR INSERT TO authenticated WITH CHECK (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_plan_steps_staff_update" ON public.intelligence_plan_steps
  FOR UPDATE TO authenticated USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_plan_steps_service_all" ON public.intelligence_plan_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_intel_plan_steps_updated BEFORE UPDATE ON public.intelligence_plan_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();