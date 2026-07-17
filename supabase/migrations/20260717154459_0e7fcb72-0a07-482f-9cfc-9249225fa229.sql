
-- 1. ai_room_readiness_insights
CREATE TABLE public.ai_room_readiness_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  insight_type text NOT NULL CHECK (insight_type IN ('arrival_risk','delayed_readiness','turnaround_pressure','special_preparation')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  title text NOT NULL,
  reasoning text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','converted_to_task')),
  generated_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_room_readiness_insights TO authenticated;
GRANT ALL ON public.ai_room_readiness_insights TO service_role;
ALTER TABLE public.ai_room_readiness_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read readiness" ON public.ai_room_readiness_insights FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "managers manage readiness" ON public.ai_room_readiness_insights FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception','housekeeping']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception','housekeeping']::public.app_role[]));
CREATE TRIGGER trg_ai_room_readiness_updated BEFORE UPDATE ON public.ai_room_readiness_insights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_room_readiness_status ON public.ai_room_readiness_insights(status, created_at DESC);
CREATE INDEX idx_room_readiness_room ON public.ai_room_readiness_insights(room_id);

-- 2. ai_operations_patterns
CREATE TABLE public.ai_operations_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL CHECK (pattern_type IN ('guest_request','complaint','seasonal_pressure','delay','resource_constraint','other')),
  title text NOT NULL,
  description text NOT NULL,
  metric_change numeric,
  timeframe_days integer NOT NULL DEFAULT 30,
  occurrences integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text,
  confidence numeric(4,3) NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','actioned')),
  generated_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_operations_patterns TO authenticated;
GRANT ALL ON public.ai_operations_patterns TO service_role;
ALTER TABLE public.ai_operations_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read patterns" ON public.ai_operations_patterns FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "managers manage patterns" ON public.ai_operations_patterns FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE TRIGGER trg_ai_ops_patterns_updated BEFORE UPDATE ON public.ai_operations_patterns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ops_patterns_status ON public.ai_operations_patterns(status, created_at DESC);

-- 3. ai_service_recovery_insights
CREATE TABLE public.ai_service_recovery_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  signal_source text NOT NULL CHECK (signal_source IN ('concierge_escalation','guest_feedback','review','ai_alert','stay_insight','other')),
  source_ref uuid,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  signal text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','converted_to_task','resolved')),
  generated_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_service_recovery_insights TO authenticated;
GRANT ALL ON public.ai_service_recovery_insights TO service_role;
ALTER TABLE public.ai_service_recovery_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read recovery" ON public.ai_service_recovery_insights FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "managers manage recovery" ON public.ai_service_recovery_insights FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]));
CREATE TRIGGER trg_ai_svc_recovery_updated BEFORE UPDATE ON public.ai_service_recovery_insights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_svc_recovery_status ON public.ai_service_recovery_insights(status, created_at DESC);

-- 4. ai_staff_operations_insights
CREATE TABLE public.ai_staff_operations_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type text NOT NULL CHECK (insight_type IN ('training_opportunity','process_improvement','resource_recommendation','workload_balance','response_time')),
  title text NOT NULL,
  reasoning text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_area text,
  recommendation text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','actioned')),
  generated_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_staff_operations_insights TO authenticated;
GRANT ALL ON public.ai_staff_operations_insights TO service_role;
ALTER TABLE public.ai_staff_operations_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read staff insights" ON public.ai_staff_operations_insights FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE POLICY "managers manage staff insights" ON public.ai_staff_operations_insights FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE TRIGGER trg_ai_staff_ops_updated BEFORE UPDATE ON public.ai_staff_operations_insights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_staff_ops_status ON public.ai_staff_operations_insights(status, created_at DESC);
