-- Restore server-only write access to campaign attribution.
-- The earlier CPS-03 grant was not sufficient against the project's default
-- table privileges; explicitly revoke all client write paths.
BEGIN;
REVOKE ALL ON TABLE public.campaign_attribution FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campaign_attribution TO authenticated;
GRANT ALL ON TABLE public.campaign_attribution TO service_role;
COMMIT;
