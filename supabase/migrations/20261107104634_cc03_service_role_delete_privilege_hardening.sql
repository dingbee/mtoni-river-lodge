-- CC-03.06 — remove unnecessary direct delete privileges from service_role.
-- Commercial lifecycle roots and founder authority configuration are managed
-- through controlled server-side operations; direct row deletion is not needed.

REVOKE DELETE ON TABLE
  public.commercial_accounts,
  public.commercial_subscriptions,
  public.commercial_founder_tenant_config,
  public.commercial_founder_admin_memberships
FROM service_role;
