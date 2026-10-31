-- SN-IQ-04.4 webhook inbox: verified, property-routed provider payloads.
-- ARTIFACT ONLY; apply only after isolated DB review.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_provider_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  channel_id uuid REFERENCES public.ai_concierge_channels(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('meta_cloud_api','resend')),
  external_account_id text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  normalized_event jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','ignored','failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS ai_provider_webhook_inbox_property_received_idx
  ON public.ai_provider_webhook_inbox(property_id, received_at DESC);
ALTER TABLE public.ai_provider_webhook_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_webhook_inbox FROM anon, authenticated;
GRANT ALL ON public.ai_provider_webhook_inbox TO service_role;
COMMIT;
