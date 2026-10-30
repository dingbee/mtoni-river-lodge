-- SN-IQ-01: restrict global concierge channel configuration to the
-- Nolmark CDMA founder owner and restore the idempotent channel registry seed.
-- No provider secrets are stored in this registry.

CREATE OR REPLACE FUNCTION public.is_staynas_founder_ai_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_property_members AS member
    JOIN public.staynas_properties AS property
      ON property.id = member.property_id
    JOIN public.staynas_organisations AS organisation
      ON organisation.id = property.organisation_id
    WHERE member.user_id = auth.uid()
      AND member.role = 'owner'::public.app_role
      AND member.status = 'active'
      AND property.status = 'active'
      AND organisation.slug = 'nolmark-cdma'
      AND organisation.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_staynas_founder_ai_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staynas_founder_ai_admin() TO authenticated;

DROP POLICY IF EXISTS "channels staff read" ON public.ai_concierge_channels;
DROP POLICY IF EXISTS "channels admin write" ON public.ai_concierge_channels;

CREATE POLICY "channels founder read"
  ON public.ai_concierge_channels
  FOR SELECT TO authenticated
  USING (public.is_staynas_founder_ai_admin());

CREATE POLICY "channels founder manage"
  ON public.ai_concierge_channels
  FOR ALL TO authenticated
  USING (public.is_staynas_founder_ai_admin(auth.uid()))
  WITH CHECK (public.is_staynas_founder_ai_admin(auth.uid()));

INSERT INTO public.ai_concierge_channels
  (channel, provider, display_name, status, inbound_enabled, outbound_enabled, requires_approval)
VALUES
  ('web', 'website', 'Website Concierge', 'active', true, true, false),
  ('whatsapp', 'meta_cloud_api', 'WhatsApp Concierge', 'inactive', false, false, true),
  ('email', 'resend', 'Email Concierge', 'inactive', false, false, true)
ON CONFLICT (channel) DO NOTHING;
