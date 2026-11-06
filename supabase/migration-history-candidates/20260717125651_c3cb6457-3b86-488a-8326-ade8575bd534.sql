
-- Extend knowledge base with guest visibility flag
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS is_guest_visible boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_guest_visible
  ON public.knowledge_documents(is_guest_visible)
  WHERE is_guest_visible = true;

-- Concierge sessions
CREATE TABLE public.ai_concierge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  locale text,
  user_agent text,
  referer text,
  page_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  guest_name text,
  guest_email text,
  guest_phone text,
  message_count integer NOT NULL DEFAULT 0,
  escalated boolean NOT NULL DEFAULT false,
  escalation_channel text,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_concierge_sessions TO authenticated;
GRANT ALL ON public.ai_concierge_sessions TO service_role;
ALTER TABLE public.ai_concierge_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read concierge sessions"
  ON public.ai_concierge_sessions FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing']::public.app_role[]));

-- Concierge messages
CREATE TABLE public.ai_concierge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  escalated boolean NOT NULL DEFAULT false,
  model text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_concierge_messages_session ON public.ai_concierge_messages(session_id, created_at);
GRANT SELECT ON public.ai_concierge_messages TO authenticated;
GRANT ALL ON public.ai_concierge_messages TO service_role;
ALTER TABLE public.ai_concierge_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read concierge messages"
  ON public.ai_concierge_messages FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing']::public.app_role[]));

-- Insights rollup
CREATE TABLE public.ai_concierge_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_date date NOT NULL,
  topic text NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  escalation_count integer NOT NULL DEFAULT 0,
  sample_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_date, topic)
);
GRANT SELECT ON public.ai_concierge_insights TO authenticated;
GRANT ALL ON public.ai_concierge_insights TO service_role;
ALTER TABLE public.ai_concierge_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read concierge insights"
  ON public.ai_concierge_insights FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing']::public.app_role[]));

CREATE TRIGGER trg_concierge_sessions_updated
  BEFORE UPDATE ON public.ai_concierge_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_concierge_insights_updated
  BEFORE UPDATE ON public.ai_concierge_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
