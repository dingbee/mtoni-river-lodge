-- DC-04.6 — durable distribution accounts, property grants and connections.
-- ARTIFACT ONLY: do not apply to any shared/production database.
-- Requires isolated Supabase migration, two-tenant RLS/grant tests and security review.
-- Distribution connections are deliberately separate from AI channel integrations.

BEGIN;

DO $dc04$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staynas_properties_id_organisation_unique'
      AND conrelid = 'public.staynas_properties'::regclass
  ) THEN
    ALTER TABLE public.staynas_properties
      ADD CONSTRAINT staynas_properties_id_organisation_unique
      UNIQUE (id, organisation_id);
  END IF;
END
$dc04$;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_external_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  external_account_reference text NOT NULL CHECK (length(trim(external_account_reference)) BETWEEN 1 AND 256),
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  credential_reference uuid NOT NULL,
  lifecycle text NOT NULL DEFAULT 'pending_validation'
    CHECK (lifecycle IN ('pending_validation','connected','degraded','suspended','revoked','error')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id, provider_key, environment),
  UNIQUE (organisation_id, provider_key, environment, external_account_reference)
);

COMMENT ON TABLE public.staynas_distribution_external_accounts IS
  'Provider account ownership and opaque credential handle. Never stores raw credentials or provider tokens.';
COMMENT ON COLUMN public.staynas_distribution_external_accounts.credential_reference IS
  'Opaque server-only secret broker/Vault reference; not a secret value and never returned to clients.';

CREATE TABLE IF NOT EXISTS public.staynas_distribution_account_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  external_account_id uuid NOT NULL,
  provider_key text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  grant_status text NOT NULL DEFAULT 'active' CHECK (grant_status IN ('active','revoked')),
  granted_capabilities text[] NOT NULL DEFAULT '{}',
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id, property_id),
  UNIQUE (id, organisation_id, property_id, external_account_id, provider_key, environment),
  UNIQUE (external_account_id, property_id),
  FOREIGN KEY (property_id, organisation_id)
    REFERENCES public.staynas_properties(id, organisation_id) ON DELETE RESTRICT,
  FOREIGN KEY (external_account_id, organisation_id, provider_key, environment)
    REFERENCES public.staynas_distribution_external_accounts(id, organisation_id, provider_key, environment)
    ON DELETE RESTRICT,
  CHECK (
    (grant_status = 'active' AND revoked_by IS NULL AND revoked_at IS NULL)
    OR
    (grant_status = 'revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL
      AND length(trim(coalesce(revocation_reason,''))) > 0)
  ),
  CHECK (granted_capabilities <@ ARRAY[
    'listing.read','listing.write','room_mapping.read','room_mapping.write',
    'rate_plan.read','rate_plan.write','availability.read','availability.write',
    'reservation.read','reservation.import','reservation.update','reservation.cancel',
    'connection.health'
  ]::text[])
);

COMMENT ON TABLE public.staynas_distribution_account_grants IS
  'Explicit organisation-owned provider-account grant to one property; capabilities are allow-listed and environment-bound.';

CREATE TABLE IF NOT EXISTS public.staynas_distribution_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  account_grant_id uuid NOT NULL,
  external_account_id uuid NOT NULL,
  provider_key text NOT NULL,
  adapter_version text NOT NULL CHECK (adapter_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'),
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  lifecycle text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft','pending_validation','connected','degraded','suspended','revoked','error')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id, property_id),
  UNIQUE (account_grant_id, adapter_version),
  FOREIGN KEY (account_grant_id, organisation_id, property_id, external_account_id, provider_key, environment)
    REFERENCES public.staynas_distribution_account_grants
      (id, organisation_id, property_id, external_account_id, provider_key, environment)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.staynas_distribution_connections IS
  'Property-scoped adapter connection bound to an explicit account grant, provider, adapter version and environment.';

CREATE TABLE IF NOT EXISTS public.staynas_distribution_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  account_grant_id uuid,
  connection_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'account_grant.created','account_grant.revoked',
    'connection.created','connection.lifecycle_changed','credential.rotated','credential.accessed'
  )),
  from_state text,
  to_state text,
  actor_type text NOT NULL CHECK (actor_type IN ('user','platform_admin','system')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_grant_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_account_grants(id, organisation_id, property_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id)
    ON DELETE RESTRICT,
  CHECK (account_grant_id IS NOT NULL OR connection_id IS NOT NULL),
  CHECK (
    (actor_type = 'system' AND actor_user_id IS NULL)
    OR (actor_type IN ('user','platform_admin') AND actor_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS staynas_distribution_accounts_org_provider_idx
  ON public.staynas_distribution_external_accounts(organisation_id, provider_key, environment, lifecycle);
CREATE INDEX IF NOT EXISTS staynas_distribution_grants_property_status_idx
  ON public.staynas_distribution_account_grants(property_id, grant_status, provider_key);
CREATE INDEX IF NOT EXISTS staynas_distribution_connections_property_status_idx
  ON public.staynas_distribution_connections(property_id, lifecycle, provider_key, environment);
CREATE INDEX IF NOT EXISTS staynas_distribution_audit_property_time_idx
  ON public.staynas_distribution_audit_events(property_id, occurred_at DESC);

-- Browser roles receive neither table privileges nor RLS policies. The server
-- must authenticate the caller and independently authorize property scope before
-- using service_role. RLS is defense in depth, not a substitute for that check.
ALTER TABLE public.staynas_distribution_external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_account_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_external_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_account_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_external_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_account_grants TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_connections TO service_role;
GRANT SELECT, INSERT ON public.staynas_distribution_audit_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_audit_events FROM service_role;

CREATE OR REPLACE FUNCTION public.staynas_reject_distribution_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Distribution audit events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS staynas_distribution_audit_immutable
  ON public.staynas_distribution_audit_events;
CREATE TRIGGER staynas_distribution_audit_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_distribution_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_reject_distribution_audit_mutation();

COMMIT;
