
-- 1. Link sessions to guest profile for returning-visitor recognition
ALTER TABLE public.ai_concierge_sessions
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_concierge_sessions_guest_id_idx
  ON public.ai_concierge_sessions(guest_id);

-- 2. ai_guest_memories
CREATE TABLE IF NOT EXISTS public.ai_guest_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid REFERENCES public.guests(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.ai_concierge_sessions(id) ON DELETE SET NULL,
  memory_type text NOT NULL CHECK (memory_type IN ('preference','interest','travel_style','communication_preference')),
  memory_key text NOT NULL,
  memory_value text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.60,
  source text NOT NULL DEFAULT 'ai_suggested' CHECK (source IN ('ai_suggested','staff','guest','import')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','archived')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (guest_id IS NOT NULL OR session_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ai_guest_memories_guest_idx ON public.ai_guest_memories(guest_id);
CREATE INDEX IF NOT EXISTS ai_guest_memories_session_idx ON public.ai_guest_memories(session_id);
CREATE INDEX IF NOT EXISTS ai_guest_memories_status_idx ON public.ai_guest_memories(status);
CREATE UNIQUE INDEX IF NOT EXISTS ai_guest_memories_unique_guest_key
  ON public.ai_guest_memories(guest_id, memory_type, memory_key)
  WHERE guest_id IS NOT NULL AND status = 'approved';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_guest_memories TO authenticated;
GRANT ALL ON public.ai_guest_memories TO service_role;

ALTER TABLE public.ai_guest_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read memories"
  ON public.ai_guest_memories FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "managers write memories"
  ON public.ai_guest_memories FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]));

CREATE TRIGGER trg_ai_guest_memories_updated
  BEFORE UPDATE ON public.ai_guest_memories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. ai_memory_events (audit)
CREATE TABLE IF NOT EXISTS public.ai_memory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid REFERENCES public.ai_guest_memories(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','approved','rejected','edited','deleted','archived')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_memory_events_memory_idx ON public.ai_memory_events(memory_id);

GRANT SELECT, INSERT ON public.ai_memory_events TO authenticated;
GRANT ALL ON public.ai_memory_events TO service_role;

ALTER TABLE public.ai_memory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read memory events"
  ON public.ai_memory_events FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "staff insert memory events"
  ON public.ai_memory_events FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()));

-- 4. ai_personalization_events
CREATE TABLE IF NOT EXISTS public.ai_personalization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('recommendation','response_improvement','memory_applied','conversion_impact')),
  memory_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_personalization_events_session_idx
  ON public.ai_personalization_events(session_id);
CREATE INDEX IF NOT EXISTS ai_personalization_events_guest_idx
  ON public.ai_personalization_events(guest_id);

GRANT SELECT, INSERT ON public.ai_personalization_events TO authenticated;
GRANT ALL ON public.ai_personalization_events TO service_role;

ALTER TABLE public.ai_personalization_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read personalization events"
  ON public.ai_personalization_events FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "staff insert personalization events"
  ON public.ai_personalization_events FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()));
