-- DC-07A — platform-managed distribution provider catalogue.
-- Provider endpoints and allowlists are non-secret platform configuration.
-- API keys and other credentials remain exclusively in the server-side Vault broker.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_provider_catalogue (
  provider_key text PRIMARY KEY
    CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text NOT NULL
    CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT ''
    CHECK (length(description) <= 1000),
  adapter_key text NOT NULL
    CHECK (adapter_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  adapter_version text NOT NULL
    CHECK (adapter_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'),
  lifecycle text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft','active','suspended','retired')),
  capabilities text[] NOT NULL DEFAULT '{}'
    CHECK (capabilities <@ ARRAY[
      'listing.read','listing.write','room_mapping.read','room_mapping.write',
      'rate_plan.read','rate_plan.write','availability.read','availability.write',
      'reservation.read','reservation.import','reservation.update','reservation.cancel',
      'connection.health'
    ]::text[]),
  environment_config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(environment_config) = 'object')
    CHECK (environment_config - ARRAY['sandbox','live']::text[] = '{}'::jsonb),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staynas_distribution_provider_catalogue IS
  'Platform-managed provider and adapter catalogue. Endpoint allowlists and non-secret environment configuration only; never store credentials or tokens.';
COMMENT ON COLUMN public.staynas_distribution_provider_catalogue.environment_config IS
  'Per-environment non-secret adapter configuration. Credential material is exclusively managed by the server-side credential broker.';

CREATE INDEX IF NOT EXISTS staynas_distribution_provider_catalogue_lifecycle_idx
  ON public.staynas_distribution_provider_catalogue(lifecycle, provider_key);

ALTER TABLE public.staynas_distribution_provider_catalogue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_provider_catalogue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_provider_catalogue TO service_role;
REVOKE DELETE, TRUNCATE ON public.staynas_distribution_provider_catalogue FROM service_role;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_provider_catalogue_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'provider.created','provider.updated','provider.lifecycle_changed',
    'provider.environment_config_changed','provider.capabilities_changed'
  )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('platform_admin','system')),
  change_summary text NOT NULL CHECK (length(trim(change_summary)) BETWEEN 1 AND 1000),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staynas_distribution_provider_catalogue_audit IS
  'Append-only audit trail for platform-level provider catalogue changes. Never stores endpoint credentials or secret values.';

CREATE INDEX IF NOT EXISTS staynas_distribution_provider_catalogue_audit_time_idx
  ON public.staynas_distribution_provider_catalogue_audit(provider_key, occurred_at DESC);

ALTER TABLE public.staynas_distribution_provider_catalogue_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_provider_catalogue_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.staynas_distribution_provider_catalogue_audit TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_provider_catalogue_audit FROM service_role;

COMMIT;
