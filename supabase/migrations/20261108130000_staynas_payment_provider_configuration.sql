-- StayNas provider configuration scopes and encrypted credential vault access.
-- This migration is additive. Provider credentials are stored in Supabase Vault,
-- never in public provider account rows or returned to browser clients.

DO $$
BEGIN
  IF to_regclass('public.staynas_properties') IS NULL THEN
    RAISE EXCEPTION 'staynas_properties must exist before payment provider configuration';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.staynas_guest_payment_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('pesapal','mpesa','airtel_money','mixx_by_yas','halopesa','bank_transfer','manual')),
  provider_account_ref text NOT NULL CHECK (length(btrim(provider_account_ref)) BETWEEN 2 AND 200),
  credential_secret_ref uuid,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  credential_updated_at timestamptz,
  supported_currencies text[] NOT NULL CHECK (cardinality(supported_currencies) > 0 AND supported_currencies <@ ARRAY['TZS','USD']::text[]),
  public_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_configuration)='object'),
  integration_status text NOT NULL DEFAULT 'adapter_pending' CHECK (integration_status IN ('adapter_pending','ready','blocked')),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','suspended')),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, provider, provider_account_ref),
  UNIQUE (id, organisation_id, property_id),
  CHECK (status <> 'active' OR integration_status = 'ready'),
  CHECK (provider IN ('bank_transfer','manual') OR credential_secret_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS staynas_guest_payment_provider_property_idx
  ON public.staynas_guest_payment_provider_accounts(organisation_id, property_id, status);

ALTER TABLE public.staynas_guest_payment_provider_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_guest_payment_provider_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_guest_payment_provider_accounts TO service_role;

COMMENT ON TABLE public.staynas_guest_payment_provider_accounts IS
  'Property-scoped guest collection provider accounts. Separate from platform subscription billing provider accounts.';
COMMENT ON COLUMN public.staynas_guest_payment_provider_accounts.credential_secret_ref IS
  'UUID reference to Supabase Vault. Never contains the credential itself.';
COMMENT ON COLUMN public.staynas_guest_payment_provider_accounts.integration_status IS
  'Adapter readiness is independent of credentials. Unimplemented providers remain adapter_pending and cannot be activated.';

CREATE OR REPLACE FUNCTION public.staynas_create_provider_secret(
  _secret text, _name text, _description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _secret_id uuid;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF _secret IS NULL OR length(_secret) < 8 OR length(_secret) > 12000 THEN
    RAISE EXCEPTION 'provider secret payload is invalid';
  END IF;
  EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
    INTO _secret_id USING _secret, _name, _description;
  RETURN _secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_read_provider_secret(_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _secret text;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1'
    INTO _secret USING _secret_id;
  IF _secret IS NULL THEN RAISE EXCEPTION 'provider secret not found'; END IF;
  RETURN _secret;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_create_provider_secret(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_read_provider_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_provider_secret(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_read_provider_secret(uuid) TO service_role;
