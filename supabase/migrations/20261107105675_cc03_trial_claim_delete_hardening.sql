-- CC-03 forward hardening: direct trial-claim deletion is not a service-role API.
REVOKE DELETE ON TABLE public.commercial_trial_claims FROM service_role;
