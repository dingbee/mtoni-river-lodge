
-- Intents
CREATE TABLE public.ai_concierge_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_concierge_messages(id) ON DELETE SET NULL,
  intent_level TEXT NOT NULL CHECK (intent_level IN ('high','medium','low')),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  keywords TEXT[] DEFAULT '{}',
  detected_context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_concierge_intents_session ON public.ai_concierge_intents(session_id, created_at DESC);
GRANT SELECT ON public.ai_concierge_intents TO authenticated;
GRANT ALL ON public.ai_concierge_intents TO service_role;
ALTER TABLE public.ai_concierge_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read intents" ON public.ai_concierge_intents FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','marketing']::public.app_role[]));

-- Recommendations
CREATE TABLE public.ai_concierge_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_concierge_messages(id) ON DELETE SET NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('room','experience','package')),
  item_slug TEXT NOT NULL,
  item_name TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.6,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_concierge_recs_session ON public.ai_concierge_recommendations(session_id, created_at DESC);
GRANT SELECT ON public.ai_concierge_recommendations TO authenticated;
GRANT ALL ON public.ai_concierge_recommendations TO service_role;
ALTER TABLE public.ai_concierge_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read recommendations" ON public.ai_concierge_recommendations FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','marketing']::public.app_role[]));

-- Leads
CREATE TABLE public.ai_concierge_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.ai_concierge_sessions(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  travel_period_start DATE,
  travel_period_end DATE,
  party_adults INT,
  party_children INT,
  interests TEXT[] DEFAULT '{}',
  intent_level TEXT NOT NULL DEFAULT 'medium' CHECK (intent_level IN ('high','medium','low')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','closed')),
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_concierge_leads_status ON public.ai_concierge_leads(status, created_at DESC);
GRANT SELECT, UPDATE ON public.ai_concierge_leads TO authenticated;
GRANT ALL ON public.ai_concierge_leads TO service_role;
ALTER TABLE public.ai_concierge_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read leads" ON public.ai_concierge_leads FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','marketing']::public.app_role[]));
CREATE POLICY "Staff update leads" ON public.ai_concierge_leads FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]));

CREATE TRIGGER set_ai_concierge_leads_updated_at BEFORE UPDATE ON public.ai_concierge_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
