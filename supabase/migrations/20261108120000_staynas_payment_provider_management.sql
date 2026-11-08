-- StayNas payment provider management: separate platform subscription collections
-- from tenant/property guest-payment integrations. Credentials are encrypted by the
-- application before persistence and are never readable through the client Data API.

CREATE TABLE IF NOT EXISTS public.staynas_payment_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_scope text NOT NULL CHECK (configuration_scope IN ('platform_subscription','property_guest')),
  organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  property_id uuid,
  provider text NOT NULL CHECK (provider IN ('pesapal','mpesa','airtel_money','mixx_by_yas','halopesa','bank_transfer','manual')),
  provider_account_ref text NOT NULL CHECK (length(btrim(provider_account_ref)) BETWEEN 1 AND 200),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  supported_currencies text[] NOT NULL CHECK (
    cardinality(supported_currencies) > 0
    AND supported_currencies <@ ARRAY['TZS','USD']::text[]
  ),
  public_configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(public_configuration)='object'),
  encrypted_credentials text,
  credential_updated_at timestamptz,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','suspended')),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_payment_provider_scope_owner_check CHECK (
    (configuration_scope='platform_subscription' AND organisation_id IS NULL AND property_id IS NULL)
    OR
    (configuration_scope='property_guest' AND organisation_id IS NOT NULL AND property_id IS NOT NULL)
  ),
  CONSTRAINT staynas_payment_provider_live_credentials_check CHECK (
    status <> 'active' OR encrypted_credentials IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS staynas_platform_payment_provider_unique
  ON public.staynas_payment_provider_configs(provider, provider_account_ref)
  WHERE configuration_scope='platform_subscription';

CREATE UNIQUE INDEX IF NOT EXISTS staynas_property_payment_provider_unique
  ON public.staynas_payment_provider_configs(organisation_id, property_id, provider, provider_account_ref)
  WHERE configuration_scope='property_guest';

CREATE INDEX IF NOT EXISTS staynas_payment_provider_scope_status_idx
  ON public.staynas_payment_provider_configs(configuration_scope, organisation_id, property_id, status);

COMMENT ON TABLE public.staynas_payment_provider_configs IS
  'Founder-managed platform subscription collection providers and tenant-managed property guest payment providers. Credentials are application-encrypted; raw secrets are never returned to clients.';
COMMENT ON COLUMN public.staynas_payment_provider_configs.encrypted_credentials IS
  'AES-256-GCM application-encrypted provider credentials. Decryption key is server-only and never stored in this database.';
COMMENT ON COLUMN public.staynas_payment_provider_configs.public_configuration IS
  'Non-secret display and provider settings only. Credential-like keys are rejected by server validation.';

ALTER TABLE public.staynas_payment_provider_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_payment_provider_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_payment_provider_configs TO service_role;
