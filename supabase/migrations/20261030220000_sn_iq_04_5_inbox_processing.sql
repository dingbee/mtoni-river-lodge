-- SN-IQ-04.5 inbox processing linkage. ARTIFACT ONLY; isolated DB verification required.
BEGIN;
ALTER TABLE public.ai_provider_webhook_inbox
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS message_id uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_provider_webhook_inbox_session_property_fkey') THEN
    ALTER TABLE public.ai_provider_webhook_inbox
      ADD CONSTRAINT ai_provider_webhook_inbox_session_property_fkey
      FOREIGN KEY (session_id, property_id)
      REFERENCES public.ai_concierge_sessions(id, property_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_provider_webhook_inbox_message_property_fkey') THEN
    ALTER TABLE public.ai_provider_webhook_inbox
      ADD CONSTRAINT ai_provider_webhook_inbox_message_property_fkey
      FOREIGN KEY (message_id, property_id)
      REFERENCES public.ai_omnichannel_messages(id, property_id)
      ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ai_provider_webhook_inbox_pending_idx
  ON public.ai_provider_webhook_inbox(received_at)
  WHERE processing_status IN ('received','failed');
COMMIT;
