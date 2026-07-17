-- Sprint 10 — Operations AI

CREATE TABLE public.ai_operations_briefings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  briefing_date DATE NOT NULL,
  summary TEXT NOT NULL,
  priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_operations_briefings_date_idx ON public.ai_operations_briefings(briefing_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_operations_briefings TO authenticated;
GRANT ALL ON public.ai_operations_briefings TO service_role;
ALTER TABLE public.ai_operations_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops briefings staff read" ON public.ai_operations_briefings FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "ops briefings manager write" ON public.ai_operations_briefings FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE TRIGGER ai_operations_briefings_upd BEFORE UPDATE ON public.ai_operations_briefings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_operations_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(3,2),
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_operations_alerts_status_idx ON public.ai_operations_alerts(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_operations_alerts TO authenticated;
GRANT ALL ON public.ai_operations_alerts TO service_role;
ALTER TABLE public.ai_operations_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops alerts staff read" ON public.ai_operations_alerts FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "ops alerts staff write" ON public.ai_operations_alerts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception','housekeeping']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception','housekeeping']::public.app_role[]));
CREATE TRIGGER ai_operations_alerts_upd BEFORE UPDATE ON public.ai_operations_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_operations_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  reasoning TEXT,
  confidence NUMERIC(3,2),
  impact_score INTEGER,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_operations_insights_status_idx ON public.ai_operations_insights(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_operations_insights TO authenticated;
GRANT ALL ON public.ai_operations_insights TO service_role;
ALTER TABLE public.ai_operations_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops insights staff read" ON public.ai_operations_insights FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "ops insights manager write" ON public.ai_operations_insights FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE TRIGGER ai_operations_insights_upd BEFORE UPDATE ON public.ai_operations_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
