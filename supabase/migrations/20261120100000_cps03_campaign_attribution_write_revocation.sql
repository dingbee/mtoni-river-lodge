-- Campaign attribution is immutable evidence written only by trusted server workflows.
-- Public campaign content remains tenant-managed, but public visitors cannot write it.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.booking_pages, public.booking_campaigns, public.campaign_page_content,
          public.campaign_room_selections, public.campaign_offers
FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.campaign_attribution
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.campaign_attribution TO authenticated;

COMMIT;
