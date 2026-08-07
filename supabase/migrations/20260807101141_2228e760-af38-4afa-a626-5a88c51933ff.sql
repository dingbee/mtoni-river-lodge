-- ============================================================
-- Mtoni OS — Intelligence Core foundation
-- Observe -> Understand -> Reason -> Recommend -> Act -> Learn
-- ============================================================

-- ---------- enums ----------
DO $$ BEGIN
  CREATE TYPE public.intel_module AS ENUM (
    'pms','booking','guest','revenue','marketing','restaurant',
    'operations','finance','content','platform'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intel_stage AS ENUM (
    'observe','understand','reason','recommend','act','learn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intel_severity AS ENUM ('info','low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intel_status AS ENUM (
    'new','reviewing','accepted','dismissed','expired','superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intel_action_status AS ENUM (
    'proposed','approved','executing','completed','failed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intel_memory_scope AS ENUM (
    'guest','reservation','room','module','property','global'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- shared updated_at trigger already exists as public.update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- 1. events (Observe) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  actor_id uuid,
  source text NOT NULL DEFAULT 'system',
  severity public.intel_severity NOT NULL DEFAULT 'info',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  dedupe_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.intelligence_events TO authenticated;
GRANT ALL ON public.intelligence_events TO service_role;
ALTER TABLE public.intelligence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_events_staff_read" ON public.intelligence_events
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_events_service_all" ON public.intelligence_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_events_module_time ON public.intelligence_events (module, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_events_entity ON public.intelligence_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_intel_events_unprocessed ON public.intelligence_events (occurred_at) WHERE processed_at IS NULL;
CREATE TRIGGER trg_intel_events_updated BEFORE UPDATE ON public.intelligence_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. signals (Understand) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  signal_key text NOT NULL,
  label text,
  entity_type text,
  entity_id uuid,
  value numeric,
  value_text text,
  unit text,
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  window_start timestamptz,
  window_end timestamptz,
  source_event_ids uuid[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.intelligence_signals TO authenticated;
GRANT ALL ON public.intelligence_signals TO service_role;
ALTER TABLE public.intelligence_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_signals_staff_read" ON public.intelligence_signals
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_signals_service_all" ON public.intelligence_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_signals_key ON public.intelligence_signals (signal_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_signals_entity ON public.intelligence_signals (entity_type, entity_id);
CREATE TRIGGER trg_intel_signals_updated BEFORE UPDATE ON public.intelligence_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. insights (Reason) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  insight_key text,
  title text NOT NULL,
  summary text NOT NULL,
  detail text,
  severity public.intel_severity NOT NULL DEFAULT 'info',
  importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  status public.intel_status NOT NULL DEFAULT 'new',
  entity_type text,
  entity_id uuid,
  signal_ids uuid[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_by text NOT NULL DEFAULT 'system',
  reviewed_by uuid,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.intelligence_insights TO authenticated;
GRANT ALL ON public.intelligence_insights TO service_role;
ALTER TABLE public.intelligence_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_insights_staff_read" ON public.intelligence_insights
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_insights_manager_update" ON public.intelligence_insights
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "intel_insights_service_all" ON public.intelligence_insights
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_insights_status ON public.intelligence_insights (status, importance DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_insights_module ON public.intelligence_insights (module, created_at DESC);
CREATE TRIGGER trg_intel_insights_updated BEFORE UPDATE ON public.intelligence_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. recommendations (Recommend) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  insight_id uuid REFERENCES public.intelligence_insights(id) ON DELETE SET NULL,
  recommendation_key text,
  title text NOT NULL,
  rationale text NOT NULL,
  suggested_action text,
  action_type text,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_impact text,
  impact_value numeric,
  impact_unit text,
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  status public.intel_status NOT NULL DEFAULT 'new',
  entity_type text,
  entity_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.intelligence_recommendations TO authenticated;
GRANT ALL ON public.intelligence_recommendations TO service_role;
ALTER TABLE public.intelligence_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_recs_staff_read" ON public.intelligence_recommendations
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_recs_manager_update" ON public.intelligence_recommendations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "intel_recs_service_all" ON public.intelligence_recommendations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_recs_status ON public.intelligence_recommendations (status, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_recs_module ON public.intelligence_recommendations (module, created_at DESC);
CREATE TRIGGER trg_intel_recs_updated BEFORE UPDATE ON public.intelligence_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. predictions (Reason / forecast) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  prediction_key text NOT NULL,
  label text,
  entity_type text,
  entity_id uuid,
  horizon_days integer,
  target_date date,
  predicted_value numeric,
  predicted_text text,
  lower_bound numeric,
  upper_bound numeric,
  unit text,
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  model text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_value numeric,
  actual_recorded_at timestamptz,
  accuracy numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.intelligence_predictions TO authenticated;
GRANT ALL ON public.intelligence_predictions TO service_role;
ALTER TABLE public.intelligence_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_predictions_staff_read" ON public.intelligence_predictions
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_predictions_service_all" ON public.intelligence_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_predictions_key ON public.intelligence_predictions (prediction_key, target_date DESC);
CREATE TRIGGER trg_intel_predictions_updated BEFORE UPDATE ON public.intelligence_predictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 6. actions (Act) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module public.intel_module NOT NULL,
  recommendation_id uuid REFERENCES public.intelligence_recommendations(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  title text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.intel_action_status NOT NULL DEFAULT 'proposed',
  automated boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT true,
  entity_type text,
  entity_id uuid,
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.intelligence_actions TO authenticated;
GRANT ALL ON public.intelligence_actions TO service_role;
ALTER TABLE public.intelligence_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_actions_staff_read" ON public.intelligence_actions
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_actions_manager_write" ON public.intelligence_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "intel_actions_manager_update" ON public.intelligence_actions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "intel_actions_service_all" ON public.intelligence_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_actions_status ON public.intelligence_actions (status, created_at DESC);
CREATE TRIGGER trg_intel_actions_updated BEFORE UPDATE ON public.intelligence_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 7. memory (Learn / long-term knowledge) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope public.intel_memory_scope NOT NULL DEFAULT 'property',
  module public.intel_module,
  scope_id uuid,
  memory_key text NOT NULL,
  memory_value text NOT NULL,
  memory_type text NOT NULL DEFAULT 'fact',
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  status public.intel_status NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'system',
  source_event_id uuid REFERENCES public.intelligence_events(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.intelligence_memory TO authenticated;
GRANT ALL ON public.intelligence_memory TO service_role;
ALTER TABLE public.intelligence_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_memory_staff_read" ON public.intelligence_memory
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_memory_manager_update" ON public.intelligence_memory
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "intel_memory_service_all" ON public.intelligence_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_memory_scope_key
  ON public.intelligence_memory (scope, COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid), memory_key);
CREATE INDEX IF NOT EXISTS idx_intel_memory_status ON public.intelligence_memory (status, scope);
CREATE TRIGGER trg_intel_memory_updated BEFORE UPDATE ON public.intelligence_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 8. feedback (Learn) ----------
CREATE TABLE IF NOT EXISTS public.intelligence_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  module public.intel_module,
  stage public.intel_stage,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  useful boolean,
  correction text,
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.intelligence_feedback TO authenticated;
GRANT ALL ON public.intelligence_feedback TO service_role;
ALTER TABLE public.intelligence_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_feedback_staff_read" ON public.intelligence_feedback
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "intel_feedback_staff_insert" ON public.intelligence_feedback
  FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "intel_feedback_own_update" ON public.intelligence_feedback
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "intel_feedback_service_all" ON public.intelligence_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_intel_feedback_subject ON public.intelligence_feedback (subject_type, subject_id);
CREATE TRIGGER trg_intel_feedback_updated BEFORE UPDATE ON public.intelligence_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();