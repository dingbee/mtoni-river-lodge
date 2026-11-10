-- LB-01 / CI contract hardening: make append-only audit DELETE denial explicit.
-- Additive only. No production execution is performed by this commit.
BEGIN;

REVOKE DELETE ON TABLE public.commercial_financial_audit_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE DELETE ON TABLE public.staynas_pricing_recommendation_events
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
