ALTER TYPE public.intel_action_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.intel_action_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.intel_action_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.intel_action_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.intel_action_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE public.intelligence_actions
  ADD COLUMN IF NOT EXISTS decision_id uuid REFERENCES public.intelligence_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.intelligence_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_step_id uuid REFERENCES public.intelligence_plan_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS risk_level public.intel_severity NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS execution_key text,
  ADD COLUMN IF NOT EXISTS adapter text,
  ADD COLUMN IF NOT EXISTS capability text,
  ADD COLUMN IF NOT EXISTS execution_reference text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS context_status text NOT NULL DEFAULT 'unchecked';

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_actions_execution_key_uniq
  ON public.intelligence_actions (execution_key) WHERE execution_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intel_actions_decision ON public.intelligence_actions (decision_id);

ALTER TABLE public.intelligence_decisions
  ADD COLUMN IF NOT EXISTS expected_metrics jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.intelligence_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.intelligence_actions(id) ON DELETE CASCADE,
  execution_key text NOT NULL,
  adapter text NOT NULL,
  capability text NOT NULL,
  module public.intel_module NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'requested',
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_reference text,
  error text,
  requested_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_executions_status_check
    CHECK (status = ANY (ARRAY['requested','succeeded','failed','duplicate','rejected'])),
  CONSTRAINT intelligence_executions_key_attempt_uniq UNIQUE (execution_key, attempt)
);

GRANT SELECT, INSERT, UPDATE ON public.intelligence_executions TO authenticated;
GRANT ALL ON public.intelligence_executions TO service_role;
ALTER TABLE public.intelligence_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_executions_staff_read" ON public.intelligence_executions
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_executions_manager_write" ON public.intelligence_executions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));
CREATE POLICY "intel_executions_manager_update" ON public.intelligence_executions
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));
CREATE POLICY "intel_executions_service_all" ON public.intelligence_executions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.intelligence_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.intelligence_decisions(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.intelligence_actions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.intelligence_plans(id) ON DELETE SET NULL,
  module public.intel_module NOT NULL,
  metric_key text NOT NULL,
  label text NOT NULL,
  comparator text NOT NULL DEFAULT 'gte',
  unit text,
  target_value numeric,
  actual_value numeric,
  baseline_value numeric,
  variance numeric,
  achievement numeric,
  result text NOT NULL DEFAULT 'pending',
  verification_status text NOT NULL DEFAULT 'pending',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  measure_after timestamptz,
  measured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_outcomes_result_check
    CHECK (result = ANY (ARRAY['pending','met','partially_met','missed','unavailable'])),
  CONSTRAINT intelligence_outcomes_verification_check
    CHECK (verification_status = ANY (ARRAY['pending','verified','partially_verified','failed','unverifiable'])),
  CONSTRAINT intelligence_outcomes_comparator_check
    CHECK (comparator = ANY (ARRAY['gte','lte','range','boolean'])),
  CONSTRAINT intelligence_outcomes_decision_metric_uniq UNIQUE (decision_id, metric_key)
);

GRANT SELECT, INSERT, UPDATE ON public.intelligence_outcomes TO authenticated;
GRANT ALL ON public.intelligence_outcomes TO service_role;
ALTER TABLE public.intelligence_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intel_outcomes_staff_read" ON public.intelligence_outcomes
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_outcomes_manager_write" ON public.intelligence_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));
CREATE POLICY "intel_outcomes_manager_update" ON public.intelligence_outcomes
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin','manager']::public.app_role[]));
CREATE POLICY "intel_outcomes_service_all" ON public.intelligence_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_intel_outcomes_updated BEFORE UPDATE ON public.intelligence_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_intel_outcomes_decision ON public.intelligence_outcomes (decision_id);
CREATE INDEX IF NOT EXISTS idx_intel_executions_action ON public.intelligence_executions (action_id, attempt DESC);