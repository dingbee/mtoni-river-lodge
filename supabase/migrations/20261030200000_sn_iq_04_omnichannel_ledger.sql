-- SN-IQ-04.2 — Durable, property-scoped omnichannel message ledger.
-- ARTIFACT ONLY: intentionally not applied. Requires isolated Supabase migration,
-- pgTAP, authenticated two-property RLS, and service-role dispatch verification.
--
-- Supabase Data API exposure changed on 2026-10-30: these tables are explicitly
-- denied to anon/authenticated except read-only message access for active-property
-- staff. Backend dispatch/webhook workers use server-side service_role only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_omnichannel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  guest_id uuid,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  actor_type text NOT NULL CHECK (actor_type IN ('guest','staff','assistant','system','provider')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','template','media','event')),
  subject text,
  body text,
  body_redacted text,
  provider text,
  provider_message_id text,
  client_message_id text,
  reply_to_message_id uuid REFERENCES public.ai_omnichannel_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded','queued','accepted','delivered','read','failed','undeliverable')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR message_type IN ('media','event')),
  CHECK (direction <> 'outbound' OR actor_type IN ('staff','assistant','system')),
  CHECK (direction <> 'inbound' OR actor_type IN ('guest','provider'))
);

-- Enforce that a message's property matches the owning conversation's property.
DO $sn_iq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_concierge_sessions_id_property_key'
      AND conrelid = 'public.ai_concierge_sessions'::regclass
  ) THEN
    ALTER TABLE public.ai_concierge_sessions
      ADD CONSTRAINT ai_concierge_sessions_id_property_key UNIQUE (id, property_id);
  END IF;
END
$sn_iq$;

ALTER TABLE public.ai_omnichannel_messages
  ADD CONSTRAINT ai_omnichannel_messages_session_property_fkey
  FOREIGN KEY (session_id, property_id)
  REFERENCES public.ai_concierge_sessions(id, property_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ai_omnichannel_messages_provider_dedupe_idx
  ON public.ai_omnichannel_messages(channel, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_omnichannel_messages_client_dedupe_idx
  ON public.ai_omnichannel_messages(property_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_omnichannel_messages_property_session_time_idx
  ON public.ai_omnichannel_messages(property_id, session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_omnichannel_messages_property_guest_time_idx
  ON public.ai_omnichannel_messages(property_id, guest_id, occurred_at DESC)
  WHERE guest_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_guest_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  identifier_type text NOT NULL CHECK (identifier_type IN ('email','phone','provider_contact_id','booking_reference','session_token')),
  identifier_hash text NOT NULL,
  identifier_ciphertext text,
  verification_method text NOT NULL CHECK (verification_method IN ('otp','magic_link','booking_verification','provider_verified','staff_verified')),
  verified_at timestamptz NOT NULL,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.ai_omnichannel_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, channel, identifier_type, identifier_hash)
);
CREATE INDEX IF NOT EXISTS ai_guest_identity_links_property_guest_idx
  ON public.ai_guest_identity_links(property_id, guest_id, status);
CREATE INDEX IF NOT EXISTS ai_guest_identity_links_lookup_idx
  ON public.ai_guest_identity_links(channel, identifier_type, identifier_hash)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.ai_guest_channel_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  purpose text NOT NULL CHECK (purpose IN ('transactional','service','marketing')),
  consent_status text NOT NULL CHECK (consent_status IN ('granted','denied','withdrawn','unknown')),
  consent_source text NOT NULL CHECK (consent_source IN ('guest_action','inbound_message','booking_flow','staff_recorded','imported')),
  consent_text_version text,
  evidence_message_id uuid REFERENCES public.ai_omnichannel_messages(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, guest_id, channel, purpose),
  CHECK ((consent_status <> 'withdrawn') OR withdrawn_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ai_guest_channel_preferences_dispatch_idx
  ON public.ai_guest_channel_preferences(property_id, guest_id, channel, purpose, consent_status);

CREATE TABLE IF NOT EXISTS public.ai_communication_dispatch_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES public.ai_omnichannel_messages(id) ON DELETE RESTRICT,
  draft_id uuid REFERENCES public.ai_communication_drafts(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  provider text NOT NULL,
  idempotency_key text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  approval_status text NOT NULL CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text NOT NULL CHECK (status IN ('pending','processing','accepted','retryable_failure','permanent_failure','cancelled')),
  provider_message_id text,
  request_fingerprint text NOT NULL,
  response_code integer,
  error_code text,
  error_summary text,
  next_retry_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, provider, idempotency_key, attempt_number),
  CHECK ((approval_status <> 'approved') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_communication_dispatch_due_idx
  ON public.ai_communication_dispatch_attempts(status, next_retry_at)
  WHERE status IN ('pending','retryable_failure');
CREATE INDEX IF NOT EXISTS ai_communication_dispatch_property_idx
  ON public.ai_communication_dispatch_attempts(property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_omnichannel_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES public.ai_omnichannel_messages(id) ON DELETE RESTRICT,
  dispatch_attempt_id uuid REFERENCES public.ai_communication_dispatch_attempts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_message_id text,
  event_type text NOT NULL CHECK (event_type IN ('queued','sent','delivered','read','bounced','rejected','failed','complained','unsubscribed')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS ai_omnichannel_delivery_events_message_time_idx
  ON public.ai_omnichannel_delivery_events(property_id, message_id, occurred_at DESC);

-- Deny browser writes. Public-schema exposure is not implicit on current Supabase
-- projects; grants are explicit. Service-role workers are the only writers.
REVOKE ALL ON public.ai_omnichannel_messages FROM anon, authenticated;
REVOKE ALL ON public.ai_guest_identity_links FROM anon, authenticated;
REVOKE ALL ON public.ai_guest_channel_preferences FROM anon, authenticated;
REVOKE ALL ON public.ai_communication_dispatch_attempts FROM anon, authenticated;
REVOKE ALL ON public.ai_omnichannel_delivery_events FROM anon, authenticated;

GRANT SELECT ON public.ai_omnichannel_messages TO authenticated;
GRANT ALL ON public.ai_omnichannel_messages TO service_role;
GRANT ALL ON public.ai_guest_identity_links TO service_role;
GRANT ALL ON public.ai_guest_channel_preferences TO service_role;
GRANT ALL ON public.ai_communication_dispatch_attempts TO service_role;
GRANT ALL ON public.ai_omnichannel_delivery_events TO service_role;

ALTER TABLE public.ai_omnichannel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guest_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guest_channel_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_communication_dispatch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_omnichannel_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Omnichannel messages read in active property"
  ON public.ai_omnichannel_messages FOR SELECT TO authenticated
  USING (
    property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id,
      ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
    )
    AND public.staynas_ai_session_in_active_property(
      session_id,
      ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
    )
  );

-- Identity, preferences, dispatch and delivery evidence are intentionally not
-- exposed to authenticated clients. Trusted server functions may access them
-- through service_role after explicit property authorization.
COMMIT;
