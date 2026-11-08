-- SPE-08 Pricing Intelligence: additive, property-scoped decision-support records.
-- No live rate, reservation, inventory, payment, or historical snapshot writes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_pricing_intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  run_type text NOT NULL CHECK (run_type IN ('analytics','forecast','opportunity_scan','recommendation_scan','data_quality')),
  method_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  horizon_days integer CHECK (horizon_days IS NULL OR horizon_days IN (7,14,30,60,90)),
  from_date date,
  to_date date,
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  data_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date IS NULL OR from_date IS NULL OR to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS staynas_pi_runs_property_created_idx
  ON public.staynas_pricing_intelligence_runs(property_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  room_id uuid,
  rate_plan_id uuid,
  recommendation_type text NOT NULL CHECK (recommendation_type IN (
    'rate_review','rate_increase_review','rate_decrease_review','rate_plan_review',
    'promotion_review','discount_dependency','channel_consistency','minimum_stay_review',
    'demand_anomaly','room_type_relationship'
  )),
  window_from date NOT NULL,
  window_to date NOT NULL,
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  current_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  method_version text NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'generated','pending_review','approved','rejected','expired','superseded','applied','failed'
  )),
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  decision_reason text,
  execution_reference text,
  outcome jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_to >= window_from),
  CHECK (expires_at IS NULL OR expires_at > generated_at),
  CONSTRAINT staynas_pi_recommendations_id_property_unique UNIQUE (id, property_id),
  CONSTRAINT staynas_pi_recommendation_room_property_fk
    FOREIGN KEY (room_id, property_id) REFERENCES public.rooms(id, property_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS staynas_pi_recommendations_property_status_idx
  ON public.staynas_pricing_recommendations(property_id, status, generated_at DESC);
CREATE INDEX IF NOT EXISTS staynas_pi_recommendations_expiry_idx
  ON public.staynas_pricing_recommendations(property_id, expires_at)
  WHERE status IN ('generated','pending_review');

CREATE TABLE IF NOT EXISTS public.staynas_pricing_recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('generated','submitted','approved','rejected','expired','superseded','applied','failed','outcome_recorded')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  execution_reference text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_pi_event_recommendation_property_fk
    FOREIGN KEY (recommendation_id, property_id)
    REFERENCES public.staynas_pricing_recommendations(id, property_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS staynas_pi_recommendation_events_lookup_idx
  ON public.staynas_pricing_recommendation_events(property_id, recommendation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_pricing_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  horizon_days integer NOT NULL CHECK (horizon_days IN (7,14,30,60,90)),
  from_date date NOT NULL,
  to_date date NOT NULL,
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  method_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  data_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  forecast jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  uncertainty jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS staynas_pi_forecasts_property_date_idx
  ON public.staynas_pricing_forecasts(property_id, from_date, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_pricing_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  window_from date NOT NULL,
  window_to date NOT NULL,
  baseline jsonb NOT NULL,
  proposal jsonb NOT NULL,
  result jsonb NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  method_version text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_to >= window_from)
);
CREATE INDEX IF NOT EXISTS staynas_pi_scenarios_property_created_idx
  ON public.staynas_pricing_scenarios(property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_competitor_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  competitor_name text NOT NULL CHECK (length(trim(competitor_name)) BETWEEN 1 AND 160),
  source_name text NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 160),
  source_reference text NOT NULL,
  observed_at timestamptz NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  observed_rate numeric(14,2) NOT NULL CHECK (observed_rate >= 0),
  room_description text NOT NULL,
  rate_plan_description text,
  comparability text NOT NULL CHECK (comparability IN ('comparable','partial','not_comparable','unverified')),
  value_type text NOT NULL CHECK (value_type IN ('observed','estimated')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staynas_pi_competitor_property_observed_idx
  ON public.staynas_competitor_observations(property_id, observed_at DESC);

-- All intelligence records are property-scoped. Founder oversight is kept in
-- the existing founder control plane; it does not widen tenant-facing RLS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staynas_pricing_intelligence_runs',
    'staynas_pricing_recommendations',
    'staynas_pricing_recommendation_events',
    'staynas_pricing_forecasts',
    'staynas_pricing_scenarios',
    'staynas_competitor_observations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        public.staynas_user_has_property_access((select auth.uid()), property_id)
        AND public.has_any_role((select auth.uid()), ARRAY[''owner'',''manager'',''finance'',''admin'']::public.app_role[])
      )', t || '_property_read', t
    );
  END LOOP;
END $$;

CREATE POLICY staynas_pi_runs_property_insert ON public.staynas_pricing_intelligence_runs
  FOR INSERT TO authenticated WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
CREATE POLICY staynas_pi_recommendations_property_insert ON public.staynas_pricing_recommendations
  FOR INSERT TO authenticated WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
CREATE POLICY staynas_pi_recommendations_property_update ON public.staynas_pricing_recommendations
  FOR UPDATE TO authenticated USING (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  ) WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
CREATE POLICY staynas_pi_events_property_insert ON public.staynas_pricing_recommendation_events
  FOR INSERT TO authenticated WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
CREATE POLICY staynas_pi_forecasts_property_insert ON public.staynas_pricing_forecasts
  FOR INSERT TO authenticated WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
CREATE POLICY staynas_pi_scenarios_property_insert ON public.staynas_pricing_scenarios
  FOR INSERT TO authenticated WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
CREATE POLICY staynas_pi_competitor_property_insert ON public.staynas_competitor_observations
  FOR INSERT TO authenticated WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

-- Recommendation transitions are controlled; this table is not a pricing
-- execution surface. Approved recommendations only create an audit event.
CREATE OR REPLACE FUNCTION public.staynas_pi_guard_recommendation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.property_id IS DISTINCT FROM NEW.property_id
     OR OLD.room_id IS DISTINCT FROM NEW.room_id
     OR OLD.rate_plan_id IS DISTINCT FROM NEW.rate_plan_id
     OR OLD.recommendation_type IS DISTINCT FROM NEW.recommendation_type
     OR OLD.window_from IS DISTINCT FROM NEW.window_from
     OR OLD.window_to IS DISTINCT FROM NEW.window_to
     OR OLD.current_context IS DISTINCT FROM NEW.current_context
     OR OLD.proposed_action IS DISTINCT FROM NEW.proposed_action
     OR OLD.expected_impact IS DISTINCT FROM NEW.expected_impact
     OR OLD.evidence IS DISTINCT FROM NEW.evidence
     OR OLD.explanation IS DISTINCT FROM NEW.explanation
     OR OLD.confidence IS DISTINCT FROM NEW.confidence
     OR OLD.method_version IS DISTINCT FROM NEW.method_version THEN
    RAISE EXCEPTION 'Pricing recommendation evidence and proposal are immutable';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NOT (
    (OLD.status IN ('generated','pending_review') AND NEW.status IN ('approved','rejected','expired','superseded')) OR
    (OLD.status='approved' AND NEW.status IN ('applied','failed'))
  ) THEN
    RAISE EXCEPTION 'Invalid pricing recommendation status transition: % -> %', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staynas_pi_recommendation_transition_guard ON public.staynas_pricing_recommendations;
CREATE TRIGGER staynas_pi_recommendation_transition_guard
  BEFORE UPDATE ON public.staynas_pricing_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.staynas_pi_guard_recommendation_transition();

CREATE OR REPLACE FUNCTION public.staynas_pi_reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Pricing intelligence audit history is append-only';
END $$;
DROP TRIGGER IF EXISTS staynas_pi_events_immutable ON public.staynas_pricing_recommendation_events;
CREATE TRIGGER staynas_pi_events_immutable BEFORE UPDATE OR DELETE
  ON public.staynas_pricing_recommendation_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_pi_reject_audit_mutation();

COMMENT ON TABLE public.staynas_pricing_intelligence_runs IS
  'Property-scoped, traceable pricing intelligence analytics and data-quality run evidence.';
COMMENT ON TABLE public.staynas_pricing_recommendations IS
  'Explainable property-scoped pricing recommendations. Approval never mutates published pricing.';
COMMENT ON TABLE public.staynas_pricing_forecasts IS
  'Versioned property-scoped demand forecasts with explicit coverage, confidence and limitations.';
COMMENT ON TABLE public.staynas_pricing_scenarios IS
  'Isolated hypothetical pricing scenarios; no live pricing or reservation records are referenced for writes.';
COMMENT ON TABLE public.staynas_competitor_observations IS
  'Lawful, source-attributed competitor observations with explicit comparability and freshness metadata.';

COMMIT;
