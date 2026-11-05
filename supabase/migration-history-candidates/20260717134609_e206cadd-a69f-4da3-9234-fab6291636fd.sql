
-- Sprint 9D — Omnichannel Concierge foundation

ALTER TABLE public.ai_concierge_sessions
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS channel_thread_id text,
  ADD COLUMN IF NOT EXISTS identity_confidence numeric(3,2) NOT NULL DEFAULT 0.0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_concierge_sessions_channel_chk') THEN
    ALTER TABLE public.ai_concierge_sessions
      ADD CONSTRAINT ai_concierge_sessions_channel_chk
      CHECK (channel IN ('web','whatsapp','email'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_concierge_sessions_channel_idx
  ON public.ai_concierge_sessions(channel, last_active_at DESC);
CREATE INDEX IF NOT EXISTS ai_concierge_sessions_channel_thread_idx
  ON public.ai_concierge_sessions(channel, channel_thread_id)
  WHERE channel_thread_id IS NOT NULL;

-- 1) Channels registry (config status only; no secrets)
CREATE TABLE IF NOT EXISTS public.ai_concierge_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL UNIQUE CHECK (channel IN ('web','whatsapp','email')),
  provider text,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive','configuring','error')),
  inbound_enabled boolean NOT NULL DEFAULT false,
  outbound_enabled boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_concierge_channels TO authenticated;
GRANT ALL ON public.ai_concierge_channels TO service_role;
ALTER TABLE public.ai_concierge_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels staff read" ON public.ai_concierge_channels
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "channels admin write" ON public.ai_concierge_channels
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

INSERT INTO public.ai_concierge_channels (channel, provider, display_name, status, inbound_enabled, outbound_enabled)
VALUES
  ('web', 'website', 'Website Concierge', 'active', true, true),
  ('whatsapp', 'meta_cloud_api', 'WhatsApp Concierge', 'inactive', false, false),
  ('email', 'lovable_emails', 'Email Concierge', 'inactive', false, false)
ON CONFLICT (channel) DO NOTHING;

-- 2) Conversation participants (identity resolution audit)
CREATE TABLE IF NOT EXISTS public.ai_conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  guest_id uuid,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  identifier_type text NOT NULL CHECK (identifier_type IN ('booking_reference','email','phone','session_token')),
  identifier_value text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.0,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversation_participants_session_idx
  ON public.ai_conversation_participants(session_id);
CREATE INDEX IF NOT EXISTS ai_conversation_participants_guest_idx
  ON public.ai_conversation_participants(guest_id) WHERE guest_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_participants TO authenticated;
GRANT ALL ON public.ai_conversation_participants TO service_role;
ALTER TABLE public.ai_conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants staff read" ON public.ai_conversation_participants
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "participants staff write" ON public.ai_conversation_participants
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]));

-- 3) AI communication drafts (human approval required before send)
CREATE TABLE IF NOT EXISTS public.ai_communication_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_concierge_sessions(id) ON DELETE SET NULL,
  guest_id uuid,
  booking_id uuid,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  draft_type text NOT NULL CHECK (draft_type IN ('welcome','pre_arrival','activity_intro','transfer_info','follow_up','custom')),
  subject text,
  body text NOT NULL,
  reasoning text,
  supporting_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','edited','rejected','sent','archived')),
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_communication_drafts_status_idx
  ON public.ai_communication_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_communication_drafts_guest_idx
  ON public.ai_communication_drafts(guest_id) WHERE guest_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_communication_drafts TO authenticated;
GRANT ALL ON public.ai_communication_drafts TO service_role;
ALTER TABLE public.ai_communication_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts staff read" ON public.ai_communication_drafts
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "drafts staff write" ON public.ai_communication_drafts
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]));

-- 4) Escalations queue
CREATE TABLE IF NOT EXISTS public.ai_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  guest_id uuid,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  reason text NOT NULL CHECK (reason IN ('low_confidence','complaint','payment_issue','complex_request','human_requested','other')),
  summary text,
  ai_confidence numeric(3,2),
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved','dismissed')),
  assigned_to uuid,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_escalations_status_idx
  ON public.ai_escalations(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_escalations_assigned_idx
  ON public.ai_escalations(assigned_to) WHERE assigned_to IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_escalations TO authenticated;
GRANT ALL ON public.ai_escalations TO service_role;
ALTER TABLE public.ai_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escalations staff read" ON public.ai_escalations
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "escalations staff write" ON public.ai_escalations
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations']::public.app_role[]));

-- updated_at triggers
CREATE TRIGGER ai_concierge_channels_set_updated_at BEFORE UPDATE ON public.ai_concierge_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_conversation_participants_set_updated_at BEFORE UPDATE ON public.ai_conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_communication_drafts_set_updated_at BEFORE UPDATE ON public.ai_communication_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_escalations_set_updated_at BEFORE UPDATE ON public.ai_escalations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
