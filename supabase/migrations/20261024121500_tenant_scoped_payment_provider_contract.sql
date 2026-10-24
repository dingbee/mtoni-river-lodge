-- Tenant-scoped, provider-neutral payment configuration and transaction references.
-- Credentials stay in the external secret manager; public_config is non-secret only.
ALTER TABLE public.staynas_property_integrations
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS supported_methods text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS supported_currencies text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verification_error text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.staynas_property_integrations
  DROP CONSTRAINT IF EXISTS staynas_property_integrations_environment_check;
ALTER TABLE public.staynas_property_integrations
  ADD CONSTRAINT staynas_property_integrations_environment_check
  CHECK (environment IN ('sandbox', 'live'));

ALTER TABLE public.staynas_property_integrations
  DROP CONSTRAINT IF EXISTS staynas_property_integrations_verification_status_check;
ALTER TABLE public.staynas_property_integrations
  ADD CONSTRAINT staynas_property_integrations_verification_status_check
  CHECK (verification_status IN ('not_configured', 'pending', 'verified', 'failed', 'disabled'));

ALTER TABLE public.staynas_property_integrations
  DROP CONSTRAINT IF EXISTS staynas_property_integrations_purpose_check;
ALTER TABLE public.staynas_property_integrations
  ADD CONSTRAINT staynas_property_integrations_purpose_check
  CHECK (purpose IN ('payments', 'email', 'calendar', 'analytics', 'channel_manager', 'other'));

-- Reject common credential field names from the public configuration JSON.
-- Secret-manager references remain in credential_reference.
ALTER TABLE public.staynas_property_integrations
  DROP CONSTRAINT IF EXISTS staynas_integrations_public_config_no_secrets;
ALTER TABLE public.staynas_property_integrations
  ADD CONSTRAINT staynas_integrations_public_config_no_secrets CHECK (
    NOT (
      public_config ?| ARRAY[
        'secret', 'client_secret', 'consumer_secret', 'api_key', 'apiKey',
        'access_token', 'refresh_token', 'private_key', 'password', 'consumer_key'
      ]
    )
  );

CREATE INDEX IF NOT EXISTS idx_staynas_integrations_property_purpose_enabled
  ON public.staynas_property_integrations(property_id, purpose, enabled);

CREATE INDEX IF NOT EXISTS idx_staynas_integrations_provider_environment
  ON public.staynas_property_integrations(provider, environment);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_integration_id uuid
    REFERENCES public.staynas_property_integrations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_merchant_reference text;

CREATE INDEX IF NOT EXISTS idx_bookings_payment_integration_transaction
  ON public.bookings(payment_integration_id, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_provider_merchant_reference
  ON public.bookings(payment_integration_id, provider_merchant_reference)
  WHERE payment_integration_id IS NOT NULL AND provider_merchant_reference IS NOT NULL;

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.staynas_property_integrations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text;

-- Backfill only from the booking relation; no tenant inference from hostnames.
UPDATE public.payment_events pe
SET property_id = b.property_id
FROM public.bookings b
WHERE pe.booking_id = b.id AND pe.property_id IS NULL;

UPDATE public.payment_events pe
SET integration_id = b.payment_integration_id
FROM public.bookings b
WHERE pe.booking_id = b.id AND pe.integration_id IS NULL
  AND b.payment_integration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_property_created
  ON public.payment_events(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_integration_transaction
  ON public.payment_events(integration_id, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.staynas_property_integrations.credential_reference IS
  'Reference to server-side secret storage; never store plaintext credentials here.';
COMMENT ON COLUMN public.staynas_property_integrations.public_config IS
  'Non-secret provider configuration only. Credentials must be resolved from credential_reference.';
COMMENT ON COLUMN public.bookings.payment_integration_id IS
  'Exact tenant-owned provider integration used for this payment; prevents ambiguous global provider settings.';
