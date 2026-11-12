-- CPS-05: trusted server-side campaign workflows use the Supabase service role.
-- No anonymous or authenticated direct writes are granted.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.booking_pages,
  public.booking_campaigns,
  public.campaign_page_content,
  public.campaign_room_selections,
  public.campaign_offers,
  public.campaign_attribution
TO service_role;

GRANT SELECT ON TABLE
  public.staynas_properties,
  public.rooms,
  public.staynas_rate_plans,
  public.staynas_rate_plan_publications,
  public.staynas_property_branding
TO service_role;
