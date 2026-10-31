-- SN-IQ-04.4 — provider routing and tenant-visible channel configuration.
-- ARTIFACT ONLY. Do not apply until isolated Supabase migration + RLS verification.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_provider_property_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('meta_cloud_api','resend')),
  external_account_id text NOT NULL,
  external_endpoint_id text NOT NULL,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  channel_id uuid REFERENCES public.ai_concierge_channels(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_endpoint_id),
  UNIQUE (provider, external_account_id, property_id)
);

CREATE TABLE IF NOT EXISTS public.ai_property_channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','email')),
  enabled boolean NOT NULL DEFAULT false,
  inbound_enabled boolean NOT NULL DEFAULT false,
  outbound_enabled boolean NOT NULL DEFAULT false,
  sender_display_name text,
  sender_email text,
  sender_phone_label text,
  approved_template_names text[] NOT NULL DEFAULT '{}',
  require_human_approval boolean NOT NULL DEFAULT true,
  service_consent_required boolean NOT NULL DEFAULT true,
  marketing_consent_required boolean NOT NULL DEFAULT true,
  staff_handoff_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, channel)
);

ALTER TABLE public.ai_provider_property_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_property_channel_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_property_bindings FROM anon, authenticated;
REVOKE ALL ON public.ai_property_channel_settings FROM anon, authenticated;
GRANT ALL ON public.ai_provider_property_bindings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ai_property_channel_settings TO authenticated;
GRANT ALL ON public.ai_property_channel_settings TO service_role;

CREATE POLICY "Property admins manage own channel settings"
  ON public.ai_property_channel_settings FOR ALL TO authenticated
  USING (
    public.staynas_ai_property_in_active_context(
      property_id,
      ARRAY['owner','manager','admin']::public.app_role[]
    )
  )
  WITH CHECK (
    public.staynas_ai_property_in_active_context(
      property_id,
      ARRAY['owner','manager','admin']::public.app_role[]
    )
  );

COMMIT;
