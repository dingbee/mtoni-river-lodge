-- Restore the CC-03 least-privilege service-role contract.
-- Default privileges may have granted broad table rights before CC-03's
-- explicit grants. Revoke those inherited rights before granting the exact
-- operations required by the server-side lifecycle handlers.
BEGIN;

REVOKE ALL ON TABLE
  public.commercial_accounts,
  public.commercial_subscriptions,
  public.commercial_trial_claims,
  public.commercial_subscription_events,
  public.commercial_audit_events,
  public.commercial_founder_tenant_config,
  public.commercial_founder_admin_memberships
FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.commercial_accounts,
  public.commercial_subscriptions,
  public.commercial_founder_tenant_config,
  public.commercial_founder_admin_memberships
TO service_role;

GRANT SELECT, INSERT ON TABLE
  public.commercial_trial_claims,
  public.commercial_subscription_events,
  public.commercial_audit_events
TO service_role;

COMMIT;
