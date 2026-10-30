-- SN-IQ-01: restrict global concierge channel configuration to the
-- Property-scope guest conversations. Historical rows remain unassigned
-- until their source property is verified; new sessions must carry property_id.
ALTER TABLE public.ai_concierge_sessions
  ADD COLUMN IF NOT EXISTS property_id uuid
  REFERENCES public.staynas_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_concierge_sessions_property_activity_idx
  ON public.ai_concierge_sessions(property_id, last_active_at DESC);

DROP POLICY IF EXISTS "Staff can read concierge sessions" ON public.ai_concierge_sessions;
CREATE POLICY "Staff can read concierge sessions in active property"
  ON public.ai_concierge_sessions
  FOR SELECT TO authenticated
  USING (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.staynas_property_members AS member
      WHERE member.property_id = ai_concierge_sessions.property_id
        AND member.user_id = auth.uid()
        AND member.status = 'active'
        AND member.role = ANY (ARRAY['owner','manager','admin','reception','marketing']::public.app_role[])
    )
    AND EXISTS (
      SELECT 1
      FROM public.staynas_user_property_context AS active_context
      WHERE active_context.user_id = auth.uid()
        AND active_context.property_id = ai_concierge_sessions.property_id
    )
  );

DROP POLICY IF EXISTS "Staff can read concierge messages" ON public.ai_concierge_messages;
CREATE POLICY "Staff can read concierge messages in active property"
  ON public.ai_concierge_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_concierge_sessions AS session
      JOIN public.staynas_property_members AS member
        ON member.property_id = session.property_id
      JOIN public.staynas_user_property_context AS active_context
        ON active_context.user_id = member.user_id
       AND active_context.property_id = session.property_id
      WHERE session.id = ai_concierge_messages.session_id
        AND member.user_id = auth.uid()
        AND member.status = 'active'
        AND member.role = ANY (ARRAY['owner','manager','admin','reception','marketing']::public.app_role[])
    )
  );

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

-- Concierge insights are currently global aggregates without a property key.
-- Keep them founder-only until property-scoped aggregation is implemented.
DROP POLICY IF EXISTS "Staff can read concierge insights" ON public.ai_concierge_insights;
CREATE POLICY "Founder can read global concierge insights"
  ON public.ai_concierge_insights
  FOR SELECT TO authenticated
  USING (public.is_staynas_founder_ai_admin());


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
