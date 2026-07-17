-- Copilot conversation persistence
CREATE TABLE public.ai_copilot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  role_snapshot TEXT[],
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_copilot_sessions TO authenticated;
GRANT ALL ON public.ai_copilot_sessions TO service_role;
ALTER TABLE public.ai_copilot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own copilot sessions" ON public.ai_copilot_sessions
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_copilot_sessions_user ON public.ai_copilot_sessions(user_id, updated_at DESC);

CREATE TABLE public.ai_copilot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_copilot_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  recommendation TEXT,
  tools_used TEXT[],
  domains_used TEXT[],
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC,
  duration_ms INT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_copilot_messages TO authenticated;
GRANT ALL ON public.ai_copilot_messages TO service_role;
ALTER TABLE public.ai_copilot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own copilot messages" ON public.ai_copilot_messages
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_copilot_messages_session ON public.ai_copilot_messages(session_id, created_at);

CREATE TABLE public.ai_copilot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.ai_copilot_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('helpful','needs_improvement','incorrect','missing_info')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_copilot_feedback TO authenticated;
GRANT ALL ON public.ai_copilot_feedback TO service_role;
ALTER TABLE public.ai_copilot_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own copilot feedback" ON public.ai_copilot_feedback
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ai_prompt_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  description TEXT,
  allowed_roles TEXT[],
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_prompt_library TO authenticated;
GRANT ALL ON public.ai_prompt_library TO service_role;
ALTER TABLE public.ai_prompt_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read prompts" ON public.ai_prompt_library
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()) AND is_active);

-- Seed prompts
INSERT INTO public.ai_prompt_library (category, title, prompt, description, sort_order) VALUES
('Reception','Today''s arrivals','List all guests arriving today with VIP status, special occasions, and any outstanding balances.','Morning arrivals overview',10),
('Reception','Guest briefing','Prepare a briefing for our next arriving VIP guest including preferences, past stays, and special requests.','Guest prep',20),
('Reception','Late checkout policy','What is our late checkout policy and how should I handle a request?','Policy lookup',30),
('Housekeeping','Housekeeping priorities','What are today''s housekeeping priorities? Include rooms needing turnover before arrivals.','Daily HK plan',10),
('Housekeeping','Room readiness','Which arriving rooms are not yet ready and what is blocking them?','Readiness check',20),
('Reservations','Upcoming week','Show upcoming arrivals for the next 7 days with occupancy pace.','Weekly outlook',10),
('Reservations','Overbooking risk','Are there any overbooking risks in the next 14 days?','Risk scan',20),
('Finance','Revenue summary','Give me this month''s revenue summary: gross, paid, and outstanding.','MTD revenue',10),
('Finance','Outstanding balances','List bookings with outstanding balances ranked by amount.','AR list',20),
('Marketing','Marketing summary','Summarise this week''s SEO health, latest journal articles, and reputation signals.','Weekly marketing',10),
('Marketing','Content gaps','What content gaps have guests been asking about in the concierge?','Content ideas',20),
('Management','Morning briefing','Give me the executive morning briefing across operations, guests, revenue, and marketing.','GM briefing',10),
('Management','Strategic risks','What are the top strategic risks I should know about today?','Risk radar',20),
('Maintenance','Maintenance patterns','What recurring maintenance issues have we detected recently?','Pattern check',10),
('Maintenance','Open work orders','List open maintenance tasks by priority.','Task list',20);

CREATE TRIGGER set_copilot_session_updated_at BEFORE UPDATE ON public.ai_copilot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_prompt_library_updated_at BEFORE UPDATE ON public.ai_prompt_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();