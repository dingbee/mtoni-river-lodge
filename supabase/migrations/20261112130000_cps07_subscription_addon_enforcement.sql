-- CPS-07: enforce founder-configured add-on features and quotas at the database boundary.
-- Reuses CC-02 published catalogue policy, CC-03 subscriptions and CC-05 entitlement context.
-- No new billing, subscription, entitlement or tenant identity tables are introduced.
-- Public guest reads/bookings are deliberately unaffected; only authenticated tenant
-- writes to booking/campaign configuration are checked. Service-role workflows remain
-- available to trusted server-side orchestration and isolated CI fixtures.

CREATE OR REPLACE FUNCTION public.staynas_cps07_assert_addon_feature(
  _organisation_id uuid,
  _property_id uuid,
  _feature_code text,
  _quota_code text DEFAULT NULL,
  _campaign_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_property_organisation uuid;
  v_account_id uuid;
  v_subscription_id uuid;
  v_plan_code text;
  v_plan_version integer;
  v_subscription_status text;
  v_addon_codes text[] := '{}'::text[];
  v_trial_ends_at timestamptz;
  v_period_ends_at timestamptz;
  v_composition_version uuid;
  v_composition jsonb;
  v_catalogue_version uuid;
  v_catalogue jsonb;
  v_feature_in_plan boolean := false;
  v_feature_custom boolean := false;
  v_feature_override boolean := false;
  v_feature_addon boolean := false;
  v_eligible_addon_codes text[] := '{}'::text[];
  v_override_id uuid;
  v_override_effect text;
  v_custom_rule_id uuid;
  v_platform¶»§q«^