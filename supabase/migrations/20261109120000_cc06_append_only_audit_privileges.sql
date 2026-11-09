-- CC-06 integration baseline: enforce append-only audit privileges across inherited grants.
-- This is an additive privilege correction; no data or schema objects are modified.

REVOKE DELETE ON TABLE public.commercial_financial_audit_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE DELETE ON TABLE public.staynas_pricing_recommendation_events
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.commercial_financial_audit_events IS
  'Append-only commercial financial audit evidence. Deletion is denied to all application roles.';
COMMENT ON TABLE public.staynas_pricing_recommendation_events IS
  'Append-only pricing intelligence recommendation history. Deletion is denied to all application roles.';
