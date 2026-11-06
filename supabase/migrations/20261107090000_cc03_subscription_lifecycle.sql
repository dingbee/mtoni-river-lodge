-- CC-03.02 — Durable commercial account and subscription persistence.
-- Additive schema only. No seed records, tenant role changes, membership changes,
-- subscription activation, production data backfill, or entitlement writes.
--
-- IMPORTANT:
--   * CC-02 owns catalogue/pricing/trial policy.
--   * CC-03 owns account/subscription lifecycle.
--   * CC-04 owns invoices/payments/collections/refunds.
--   * CC-05 owns runtime entitlements.
--   * restaurant_subscriptions is deliberately not reused.
--   * Founder authority is a separate commercial principal mapping, not app_role.

CREATE TABLE IF NOT EXISTS public.commercial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_accounts_organisation_unique UNIQUE (organisation_id)
);

COMMENT ON TABLE public.commercial_accounts IS
  'StayNas commercial account per organisation. Separate from restaurant/FnB subscriptions.';

CREATE TABLE IF NOT EXISTS public.commercial_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.commercial_accounts(id) ON DELETE RESTRICT,
  plan_code text NOT NULL CHECK (plan_code IN ('essential', 'professional', 'enterprise')),
  plan_version integer NOT NULL CHECK (plan_version > 0),
  currency text NOT NULL CHECK (currency IN ('TZS', 'USD')),
  billing_term text NOT NULL CHECK (billing_term IN ('monthly', 'annual')),
  property_count integer NOT NULL CHECK (property_count > 0),
  addon_codes text[] NOT NULL DEFAULT '{}',
  price_resolution_ref text NOT NULL CHECK (length(btrim(price_resolution_ref)) BETWEEN 1 AND 200),
  accepted_price_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(accepted_price_snapshot) = 'object'
    AND accepted_price_snapshot ? 'currency'
    AND accepted_price_snapshot->>'currency' = currency
  ),
  quote_required boolean NOT NULL DEFAULT false,
  commercial_acceptance_ref text,
  status text NOT NULL DEFAULT 'pending_activation'
    CHECK (status IN ('pending_activation', 'trialing', 'active', 'suspended', 'cancelled', 'expired')),
  activated_at timestamptz,
  trial_policy_version integer CHECK (trial_policy_version IS NULL OR trial_policy_version > 0),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancellation_requested_at timestamptz,
  suspended_at timestamptz,
  suspension_reason_code text,
  suspended_from_status text CHECK (suspended_from_status IS NULL OR suspended_from_status IN ('trialing', 'active')),
  ended_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_subscriptions_id_account_unique UNIQUE (id, account_id),
  CONSTRAINT commercial_subscriptions_quote_consistency CHECK (
    quote_required = (accepted_price_snapshot->>'quoteRequired' = 'true')
    AND (
      NOT quote_required OR (
      plan_code = 'enterprise'
      AND accepted_price_snapshot->>'quoteRequired' = 'true'
      AND NOT (accepted_price_snapshot ? 'total')
      AND coalesce(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(accepted_price_snapshot->'lineItems') = 'array'
            THEN accepted_price_snapshot->'lineItems'
          ELSE '[]'::jsonb
        END
      ), 0) = 0
      )
    )
  ),
  CONSTRAINT commercial_subscriptions_paid_acceptance CHECK (
    status <> 'active' OR (
      commercial_acceptance_ref IS NOT NULL
      AND length(btrim(commercial_acceptance_ref)) BETWEEN 1 AND 300
      AND current_period_starts_at IS NOT NULL
      AND current_period_ends_at > current_period_starts_at
    )
  ),
  CONSTRAINT commercial_subscriptions_trial_window CHECK (
    status <> 'trialing' OR (
      activated_at IS NOT NULL
      AND trial_policy_version IS NOT NULL
      AND trial_started_at IS NOT NULL
      AND trial_ends_at = trial_started_at + interval '336 hours'
    )
  ),
  CONSTRAINT commercial_subscriptions_suspension_evidence CHECK (
    (status = 'suspended'
      AND suspended_at IS NOT NULL
      AND suspended_from_status IS NOT NULL
      AND suspension_reason_code IS NOT NULL
      AND length(btrim(suspension_reason_code)) BETWEEN 1 AND 120)
    OR
    (status <> 'suspended'
      AND suspended_at IS NULL
      AND suspended_from_status IS NULL
      AND suspension_reason_code IS NULL)
  ),
  CONSTRAINT commercial_subscriptions_terminal_evidence CHECK (
    (status IN ('cancelled', 'expired') AND ended_at IS NOT NULL)
    OR
    (status NOT IN ('cancelled', 'expired') AND ended_at IS NULL)
  ),
  CONSTRAINT commercial_subscriptions_scheduled_cancellation CHECK (
    NOT cancel_at_period_end
    OR (
      cancellation_requested_at IS NOT NULL
      AND (
        (status = 'trialing' AND trial_ends_at IS NOT NULL)
        OR (status = 'active' AND current_period_ends_at IS NOT NULL)
        OR (status = 'suspended' AND (
          (suspended_from_status = 'trialing' AND trial_ends_at IS NOT NULL)
          OR (suspended_from_status = 'active' AND current_period_ends_at IS NOT NULL)
        ))
      )
    )
  )
);

COMMENT ON TABLE public.commercial_subscriptions IS
  'StayNas subscription lifecycle state and immutable accepted price snapshot. Not an invoice, payment, or entitlement record.';

CREATE UNIQUE INDEX IF NOT EXISTS commercial_subscriptions_one_current_per_account
  ON public.commercial_subscriptions(account_id)
  WHERE status IN ('pending_activation', 'trialing', 'active', 'suspended');

CREATE INDEX IF NOT EXISTS commercial_subscriptions_account_created_idx
  ON public.commercial_subscriptions(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_trial_claims (
  account_id uuid PRIMARY KEY REFERENCES public.commercial_accounts(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  trial_started_at timestamptz NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  CONSTRAINT commercial_trial_claims_exact_window CHECK (
    trial_ends_at = trial_started_at + interval '336 hours'
  ),
  CONSTRAINT commercial_trial_claims_subscription_unique UNIQUE (subscription_id),
  CONSTRAINT commercial_trial_claims_subscription_account_fk
    FOREIGN KEY (subscription_id, account_id)
    REFERENCES public.commercial_subscriptions(id, account_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.commercial_trial_claims IS
  'Permanent one-time trial claim per commercial account. Never delete/reset on cancellation, expiry, or plan change.';

CREATE TABLE IF NOT EXISTS public.commercial_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.commercial_accounts(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'activate_trial', 'activate_paid', 'suspend', 'reinstate',
    'request_cancellation', 'cancel_immediately', 'expire', 'renewal_authorized'
  )),
  occurred_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN (
    'founder_admin', 'tenant_admin', 'tenant_staff', 'service_principal'
  )),
  reason_code text,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_subscription_events_subscription_account_fk
    FOREIGN KEY (subscription_id, account_id)
    REFERENCES public.commercial_subscriptions(id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT commercial_subscription_events_idempotency_unique
    UNIQUE (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS commercial_subscription_events_subscription_time_idx
  ON public.commercial_subscription_events(subscription_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL CHECK (length(btrim(request_id)) BETWEEN 1 AND 200),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN (
    'founder_admin', 'tenant_admin', 'tenant_staff', 'service_principal'
  )),
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 120),
  resource_type text NOT NULL CHECK (resource_type IN (
    'commercial_account', 'subscription', 'trial_claim', 'subscription_event'
  )),
  resource_ref text NOT NULL CHECK (length(btrim(resource_ref)) BETWEEN 1 AND 300),
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'succeeded', 'failed')),
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS commercial_audit_events_occurred_idx
  ON public.commercial_audit_events(occurred_at DESC);

-- Dedicated commercial founder authority. This deliberately does not reuse
-- public.app_role, staynas_platform_admins, or property owner/manager roles.
-- No founder is seeded by this migration. Provisioning is a controlled
-- service-role operation after identity and founder-tenant membership review.
CREATE TABLE IF NOT EXISTS public.commercial_founder_tenant_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  founder_organisation_id uuid NOT NULL
    REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_founder_admin_memberships (
  principal_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  verified_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_founder_admin_membership_organisation_unique UNIQUE (principal_id, organisation_id)
);

COMMENT ON TABLE public.commercial_founder_admin_memberships IS
  'Separate founder_admin authority mapping. Managed only through controlled service-role provisioning; never derived from app_role or property owner status.';

-- Accepted commercial terms and organisation ownership are immutable.
-- A plan/price change creates a new subscription record; it does not rewrite
-- the historical accepted snapshot.
CREATE OR REPLACE FUNCTION public.guard_commercial_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'commercial_accounts' THEN
    IF NEW.organisation_id IS DISTINCT FROM OLD.organisation_id THEN
      RAISE EXCEPTION 'Commercial account organisation is immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.account_id,
    NEW.plan_code,
    NEW.plan_version,
    NEW.currency,
    NEW.billing_term,
    NEW.property_count,
    NEW.addon_codes,
    NEW.price_resolution_ref,
    NEW.accepted_price_snapshot,
    NEW.quote_required
  ) IS DISTINCT FROM ROW(
    OLD.account_id,
    OLD.plan_code,
    OLD.plan_version,
    OLD.currency,
    OLD.billing_term,
    OLD.property_count,
    OLD.addon_codes,
    OLD.price_resolution_ref,
    OLD.accepted_price_snapshot,
    OLD.quote_required
  ) OR (
    OLD.commercial_acceptance_ref IS NOT NULL
    AND NEW.commercial_acceptance_ref IS DISTINCT FROM OLD.commercial_acceptance_ref
  ) THEN
    RAISE EXCEPTION 'Accepted commercial subscription snapshot is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_commercial_immutable_fields() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS commercial_accounts_organisation_immutable
  ON public.commercial_accounts;
CREATE TRIGGER commercial_accounts_organisation_immutable
  BEFORE UPDATE ON public.commercial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_fields();

DROP TRIGGER IF EXISTS commercial_subscriptions_snapshot_immutable
  ON public.commercial_subscriptions;
CREATE TRIGGER commercial_subscriptions_snapshot_immutable
  BEFORE UPDATE ON public.commercial_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_fields();

-- Database-level lifecycle transition guard. Terminal states cannot reopen,
-- and transitions must follow the CC-03 state machine.
CREATE OR REPLACE FUNCTION public.guard_commercial_subscription_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'Terminal commercial subscriptions cannot be reopened'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    (OLD.status = 'pending_activation' AND NEW.status IN ('trialing', 'active', 'cancelled'))
    OR (OLD.status = 'trialing' AND NEW.status IN ('active', 'suspended', 'cancelled', 'expired'))
    OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'cancelled', 'expired'))
    OR (OLD.status = 'suspended' AND NEW.status IN ('trialing', 'active', 'cancelled', 'expired'))
  ) THEN
    RAISE EXCEPTION 'Invalid commercial subscription lifecycle transition: % -> %',
      OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_commercial_subscription_status() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS commercial_subscriptions_status_transition_guard
  ON public.commercial_subscriptions;
CREATE TRIGGER commercial_subscriptions_status_transition_guard
  BEFORE UPDATE OF status ON public.commercial_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_subscription_status();

-- A trialing subscription and its one-time trial claim must commit together.
CREATE OR REPLACE FUNCTION public.ensure_commercial_trial_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.status = 'trialing' AND NOT EXISTS (
    SELECT 1
    FROM public.commercial_trial_claims tc
    WHERE tc.account_id = NEW.account_id
      AND tc.subscription_id = NEW.id
      AND tc.policy_version = NEW.trial_policy_version
      AND tc.trial_started_at = NEW.trial_started_at
      AND tc.trial_ends_at = NEW.trial_ends_at
  ) THEN
    RAISE EXCEPTION 'Trialing subscription requires its matching permanent trial claim'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_commercial_trial_claim() FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER commercial_subscription_trial_claim_required
  AFTER INSERT OR UPDATE ON public.commercial_subscriptions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ensure_commercial_trial_claim();

CREATE OR REPLACE FUNCTION public.ensure_trial_claim_targets_trialing_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.commercial_subscriptions s
    WHERE s.id = NEW.subscription_id
      AND s.account_id = NEW.account_id
      AND s.status = 'trialing'
      AND s.trial_policy_version = NEW.policy_version
      AND s.trial_started_at = NEW.trial_started_at
      AND s.trial_ends_at = NEW.trial_ends_at
  ) THEN
    RAISE EXCEPTION 'Trial claim must match an activated trialing subscription'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_trial_claim_targets_trialing_subscription() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS commercial_trial_claim_requires_trialing_subscription
  ON public.commercial_trial_claims;
CREATE TRIGGER commercial_trial_claim_requires_trialing_subscription
  BEFORE INSERT ON public.commercial_trial_claims
  FOR EACH ROW EXECUTE FUNCTION public.ensure_trial_claim_targets_trialing_subscription();

-- Tenant scope helper follows the verified organisation -> active property
-- -> active property-membership relation. It can only answer for auth.uid().
CREATE OR REPLACE FUNCTION public.commercial_user_has_organisation_access(
  _organisation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN _organisation_id IS NULL OR auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.staynas_properties p
      JOIN public.staynas_property_members pm
        ON pm.property_id = p.id
      WHERE p.organisation_id = _organisation_id
        AND p.status = 'active'
        AND pm.user_id = auth.uid()
        AND pm.status = 'active'
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.commercial_user_has_organisation_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_user_has_organisation_access(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.commercial_user_has_organisation_access(uuid) IS
  'Tenant scope predicate based on the caller active membership in an active property belonging to the organisation.';

-- Founder authority is verified against three independent facts:
-- (1) the configured founder organisation, (2) an explicit commercial
-- founder_admin principal mapping provisioned by service_role, and
-- (3) an active StayNas property membership in that same organisation.
-- A caller cannot probe another principal because auth.uid() must match input.
CREATE OR REPLACE FUNCTION public.commercial_is_founder_admin(
  _principal_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN _principal_id IS NULL OR auth.uid() IS DISTINCT FROM _principal_id
      THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.commercial_founder_tenant_config cfg
      JOIN public.commercial_founder_admin_memberships fam
        ON fam.organisation_id = cfg.founder_organisation_id
       AND fam.principal_id = _principal_id
       AND fam.status = 'active'
      WHERE cfg.singleton = true
        AND EXISTS (
          SELECT 1
          FROM public.staynas_properties p
          JOIN public.staynas_property_members pm
            ON pm.property_id = p.id
          WHERE p.organisation_id = cfg.founder_organisation_id
            AND p.status = 'active'
            AND pm.user_id = _principal_id
            AND pm.status = 'active'
        )
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.commercial_is_founder_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_is_founder_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.commercial_is_founder_admin(uuid) IS
  'True only for the caller whose explicit commercial founder_admin mapping matches the configured founder organisation and an active property membership in that organisation.';

-- Enforce that every active founder principal belongs to the configured
-- founder organisation at authorization time in the server-side policy.
-- Config and membership rows are intentionally unseeded here.

CREATE OR REPLACE FUNCTION public.reject_commercial_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Commercial history is append-only'
    USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_commercial_history_mutation() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS commercial_subscription_events_append_only
  ON public.commercial_subscription_events;
CREATE TRIGGER commercial_subscription_events_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_history_mutation();

DROP TRIGGER IF EXISTS commercial_audit_events_append_only
  ON public.commercial_audit_events;
CREATE TRIGGER commercial_audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_history_mutation();

-- Prevent deletion of lifecycle roots and founder authority history.
CREATE OR REPLACE FUNCTION public.reject_commercial_record_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Commercial lifecycle records cannot be deleted'
    USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_commercial_record_deletion() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS commercial_accounts_no_delete ON public.commercial_accounts;
CREATE TRIGGER commercial_accounts_no_delete
  BEFORE DELETE ON public.commercial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_record_deletion();

DROP TRIGGER IF EXISTS commercial_subscriptions_no_delete ON public.commercial_subscriptions;
CREATE TRIGGER commercial_subscriptions_no_delete
  BEFORE DELETE ON public.commercial_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_record_deletion();

DROP TRIGGER IF EXISTS commercial_trial_claims_append_only ON public.commercial_trial_claims;
CREATE TRIGGER commercial_trial_claims_append_only
  BEFORE UPDATE OR DELETE ON public.commercial_trial_claims
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_history_mutation();

DROP TRIGGER IF EXISTS commercial_founder_admin_memberships_no_delete
  ON public.commercial_founder_admin_memberships;
CREATE TRIGGER commercial_founder_admin_memberships_no_delete
  BEFORE DELETE ON public.commercial_founder_admin_memberships
  FOR EACH ROW EXECUTE FUNCTION public.reject_commercial_record_deletion();

-- RLS is enabled and forced. No anon/authenticated policies or table grants
-- are created. Runtime access is through authenticated server handlers that
-- perform tenant/founder authorization before using the service-role client.
DO $block$
DECLARE
  v_table regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.commercial_accounts'::regclass,
    'public.commercial_subscriptions'::regclass,
    'public.commercial_trial_claims'::regclass,
    'public.commercial_subscription_events'::regclass,
    'public.commercial_audit_events'::regclass,
    'public.commercial_founder_tenant_config'::regclass,
    'public.commercial_founder_admin_memberships'::regclass
  ]
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', v_table);
  END LOOP;
END;
$block$;

REVOKE ALL ON TABLE
  public.commercial_accounts,
  public.commercial_subscriptions,
  public.commercial_trial_claims,
  public.commercial_subscription_events,
  public.commercial_audit_events,
  public.commercial_founder_tenant_config,
  public.commercial_founder_admin_memberships
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.commercial_accounts,
  public.commercial_subscriptions,
  public.commercial_founder_tenant_config,
  public.commercial_founder_admin_memberships
TO service_role;

GRANT SELECT, INSERT ON TABLE public.commercial_trial_claims TO service_role;

GRANT SELECT, INSERT ON TABLE
  public.commercial_subscription_events,
  public.commercial_audit_events
TO service_role;

-- No production bootstrap, tenant assignment, subscription record, or founder
-- principal is created by this migration.
