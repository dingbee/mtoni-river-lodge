-- CC-03 forward hardening: direct deletion is not a service-role API for commercial lifecycle evidence.
REVOKE DELETE ON TABLE
  public.commercial_trial_claims,
  public.commercial_subscription_events,
  public.commercial_audit_events
FROM service_role;
