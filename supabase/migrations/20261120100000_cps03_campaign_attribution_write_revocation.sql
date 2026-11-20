-- Campaign attribution is immutable evidence written only by trusted server workflows.
-- Preserve tenant-readable SELECT while removing inherited default write grants.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.campaign_attribution
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.campaign_attribution TO authenticated;

COMMIT;
