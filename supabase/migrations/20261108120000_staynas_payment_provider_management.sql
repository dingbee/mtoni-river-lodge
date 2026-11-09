-- Platform-level provider accounts for StayNas subscription collections.
-- Property guest-payment provider accounts are stored separately in the
-- staynas_guest_payment_provider_accounts table introduced by the following migration.
-- Both scopes use Supabase Vault references; provider credentials never enter public rows.

CREATE TABLE IF NOT EXISTS public.staynas_platform_payment_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('pesapal','mpesa','airtel_money','mixx_by_yas','halopesa','bank_transfer','manual')),
  provider_account_ref text NOT NULL CHECK (length(btrim(provider_account_ref)) BETWEEN 2 AND 200),
  credential_secret_ref uuid,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  supported_currencies text[] NOT NULL CHECK (
    cardinality(supported_currencies) > 0
    AND supported_currencies <@ ARRAY['TZS','USD']::text[]
  ),
  public_configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(public_configuration)='object'),
  integration_status text NOT NULL DEFAULT 'adapter_pending'
    CHECK (integration_status IN ('adapter_pending','ready','blocked')),
  status text NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive','active','suspended')),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  credential_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_ref),
  CHECK (status <> 'active' OR integration_status='ready'),
  CHECK (provider IN ('bank_transfer','manual') OR credential_secret_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS staynas_platform_payment_provider_status_idx
  ON public.staynas_platform_payment_provider_accounts(status, provider);

ALTER TABLE public.staynas_platform_payment_provider_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_platform_payment_provider_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_platform_payment_provider_accounts TO service_role;

COMMENT ON TABLE public.staynas_platform_payment_provider_accounts IS
  'Founder-managed provider accounts for StayNas subscription billing. Separate from property guest-payment integrations.';
COMMENT ON COLUMN public.staynas_platform_payment_provider_accounts.credential_secret_ref IS
  'UUID reference to Supabase Vault. Never contains the credential itself.';
COMMENT ON COLUMN public.staynas_platform_payment_provider_accounts.integration_status IS
  'Provider adapter certification state. Credentials alone do not make a provider activatable.';
