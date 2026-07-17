
-- Sprint 9F: Concierge Conversion Intelligence

-- 1. Outcomes
CREATE TABLE public.ai_concierge_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'information_request','room_enquiry','experience_enquiry','booking_intent',
    'lead_captured','escalated','converted','abandoned'
  )),
  confidence NUMERIC(4,3) DEFAULT 0.5,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concierge_outcomes_session ON public.ai_concierge_outcomes(session_id);
CREATE INDEX idx_concierge_outcomes_type_created ON public.ai_concierge_outcomes(outcome_type, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_concierge_outcomes TO authenticated;
GRANT ALL ON public.ai_concierge_outcomes TO service_role;
ALTER TABLE public.ai_concierge_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read outcomes" ON public.ai_concierge_outcomes FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Staff write outcomes" ON public.ai_concierge_outcomes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing','reservations']::public.app_role[]));

-- 2. Attributions
CREATE TABLE public.ai_concierge_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  conversion_type TEXT NOT NULL DEFAULT 'booking_click' CHECK (conversion_type IN (
    'booking_click','lead','assisted_booking','direct_booking'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concierge_attributions_session ON public.ai_concierge_attributions(session_id);
CREATE INDEX idx_concierge_attributions_booking ON public.ai_concierge_attributions(booking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_concierge_attributions TO authenticated;
GRANT ALL ON public.ai_concierge_attributions TO service_role;
ALTER TABLE public.ai_concierge_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read attributions" ON public.ai_concierge_attributions FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Staff write attributions" ON public.ai_concierge_attributions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]));

-- 3. Extend insights
ALTER TABLE public.ai_concierge_insights
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'demand',
  ADD COLUMN IF NOT EXISTS impact_score NUMERIC(4,3) DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new' CHECK (status IN ('new','reviewed','accepted','dismissed','converted')),
  ADD COLUMN IF NOT EXISTS recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb;

-- 4. Feedback
CREATE TABLE public.ai_concierge_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_concierge_messages(id) ON DELETE SET NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful','not_helpful')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concierge_feedback_session ON public.ai_concierge_feedback(session_id);
GRANT SELECT ON public.ai_concierge_feedback TO authenticated;
GRANT INSERT ON public.ai_concierge_feedback TO anon, authenticated;
GRANT ALL ON public.ai_concierge_feedback TO service_role;
ALTER TABLE public.ai_concierge_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read feedback" ON public.ai_concierge_feedback FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
-- inserts happen server-side via service role (public endpoint), no anon policy needed
