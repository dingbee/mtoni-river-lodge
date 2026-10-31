-- SN-IQ-01: close direct-table tenant isolation gaps across concierge data.
-- Application-level property filters are not a substitute for RLS. All staff
-- access below is bound to the user's active property and active membership.
-- This migration is intentionally not applied until isolated DB verification.

CREATE OR REPLACE FUNCTION public.staynas_ai_property_in_active_context(
  _property_id uuid,
  _allowed_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_property_members AS member
    JOIN public.staynas_user_property_context AS active_context
      ON active_context.user_id = member.user_id
     AND active_context.property_id = member.property_id
    JOIN public.staynas_properties AS property
      ON property.id = member.property_id
    WHERE member.user_id = auth.uid()
      AND member.property_id = _property_id
      AND member.status = 'active'
      AND member.role = ANY (_allowed_roles)
      AND property.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.staynas_ai_session_in_active_property(
  _session_id uuid,
  _allowed_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ai_concierge_sessions AS session
    WHERE session.id = _session_id
      AND session.property_id IS NOT NULL
      AND public.staynas_ai_property_in_active_context(session.property_id, _allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.staynas_ai_booking_in_active_property(
  _booking_id uuid,
  _allowed_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings AS booking
    WHERE booking.id = _booking_id
      AND booking.property_id IS NOT NULL
      AND public.staynas_ai_property_in_active_context(booking.property_id, _allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.staynas_ai_property_in_active_context(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_ai_session_in_active_property(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_ai_booking_in_active_property(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_ai_property_in_active_context(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_ai_session_in_active_property(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_ai_booking_in_active_property(uuid, public.app_role[]) TO authenticated;

-- Leads: rows without a verified property association remain inaccessible.
DROP POLICY IF EXISTS "Staff read leads" ON public.ai_concierge_leads;
DROP POLICY IF EXISTS "Staff update leads" ON public.ai_concierge_leads;
CREATE POLICY "Concierge leads read in active property"
  ON public.ai_concierge_leads FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Concierge leads update in active property"
  ON public.ai_concierge_leads FOR UPDATE TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ));

-- Guest memories and their audit events.
DROP POLICY IF EXISTS "staff read memories" ON public.ai_guest_memories;
DROP POLICY IF EXISTS "managers write memories" ON public.ai_guest_memories;
CREATE POLICY "Guest memories read in active property"
  ON public.ai_guest_memories FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Guest memories manage in active property"
  ON public.ai_guest_memories FOR ALL TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ));

DROP POLICY IF EXISTS "staff read memory events" ON public.ai_memory_events;
DROP POLICY IF EXISTS "staff insert memory events" ON public.ai_memory_events;
CREATE POLICY "Memory events read in active property"
  ON public.ai_memory_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_guest_memories AS memory
    WHERE memory.id = ai_memory_events.memory_id
      AND public.staynas_ai_property_in_active_context(
        memory.property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
      )
  ));
CREATE POLICY "Memory events insert in active property"
  ON public.ai_memory_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_guest_memories AS memory
    WHERE memory.id = ai_memory_events.memory_id
      AND public.staynas_ai_property_in_active_context(
        memory.property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
      )
  ));

-- Personalization events carry their property_id directly.
DROP POLICY IF EXISTS "staff read personalization events" ON public.ai_personalization_events;
DROP POLICY IF EXISTS "staff insert personalization events" ON public.ai_personalization_events;
CREATE POLICY "Personalization events read in active property"
  ON public.ai_personalization_events FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Personalization events insert in active property"
  ON public.ai_personalization_events FOR INSERT TO authenticated
  WITH CHECK (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));

-- Session-linked read-only intelligence tables.
DROP POLICY IF EXISTS "Staff read intents" ON public.ai_concierge_intents;
CREATE POLICY "Concierge intents read in active property"
  ON public.ai_concierge_intents FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));

DROP POLICY IF EXISTS "Staff read recommendations" ON public.ai_concierge_recommendations;
CREATE POLICY "Concierge recommendations read in active property"
  ON public.ai_concierge_recommendations FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));

-- Outcomes and attributions are writable only by the roles already permitted
-- by their legacy policies, and only for sessions in the active property.
DROP POLICY IF EXISTS "Staff read outcomes" ON public.ai_concierge_outcomes;
DROP POLICY IF EXISTS "Staff write outcomes" ON public.ai_concierge_outcomes;
CREATE POLICY "Concierge outcomes read in active property"
  ON public.ai_concierge_outcomes FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','marketing','reservations','reception']::public.app_role[]
  ));
CREATE POLICY "Concierge outcomes manage in active property"
  ON public.ai_concierge_outcomes FOR ALL TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','marketing','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','marketing','reservations']::public.app_role[]
  ));

DROP POLICY IF EXISTS "Staff read attributions" ON public.ai_concierge_attributions;
DROP POLICY IF EXISTS "Staff write attributions" ON public.ai_concierge_attributions;
CREATE POLICY "Concierge attributions read in active property"
  ON public.ai_concierge_attributions FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Concierge attributions manage in active property"
  ON public.ai_concierge_attributions FOR ALL TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ));

DROP POLICY IF EXISTS "Staff read feedback" ON public.ai_concierge_feedback;
CREATE POLICY "Concierge feedback read in active property"
  ON public.ai_concierge_feedback FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));

-- Omnichannel participant, draft and escalation records.
DROP POLICY IF EXISTS "participants staff read" ON public.ai_conversation_participants;
DROP POLICY IF EXISTS "participants staff write" ON public.ai_conversation_participants;
CREATE POLICY "Conversation participants read in active property"
  ON public.ai_conversation_participants FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Conversation participants manage in active property"
  ON public.ai_conversation_participants FOR ALL TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ));

DROP POLICY IF EXISTS "drafts staff read" ON public.ai_communication_drafts;
DROP POLICY IF EXISTS "drafts staff write" ON public.ai_communication_drafts;
CREATE POLICY "Communication drafts read in active property"
  ON public.ai_communication_drafts FOR SELECT TO authenticated
  USING (
    session_id IS NOT NULL
    AND public.staynas_ai_session_in_active_property(
      session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
    )
    AND (
      booking_id IS NULL
      OR public.staynas_ai_booking_in_active_property(
        booking_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
      )
    )
  );
CREATE POLICY "Communication drafts manage in active property"
  ON public.ai_communication_drafts FOR ALL TO authenticated
  USING (
    session_id IS NOT NULL
    AND public.staynas_ai_session_in_active_property(
      session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
    )
    AND (
      booking_id IS NULL
      OR public.staynas_ai_booking_in_active_property(
        booking_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
      )
    )
  )
  WITH CHECK (
    session_id IS NOT NULL
    AND public.staynas_ai_session_in_active_property(
      session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
    )
    AND (
      booking_id IS NULL
      OR public.staynas_ai_booking_in_active_property(
        booking_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
      )
    )
  );

DROP POLICY IF EXISTS "escalations staff read" ON public.ai_escalations;
DROP POLICY IF EXISTS "escalations staff write" ON public.ai_escalations;
CREATE POLICY "Escalations read in active property"
  ON public.ai_escalations FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Escalations manage in active property"
  ON public.ai_escalations FOR ALL TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ));

-- Rebind the session and message read policies to the same active-property
-- predicate used by the child intelligence tables. This also rejects inactive
-- properties and keeps historical NULL-property sessions inaccessible.
DROP POLICY IF EXISTS "Staff can read concierge sessions in active property" ON public.ai_concierge_sessions;
CREATE POLICY "Concierge sessions read in active property"
  ON public.ai_concierge_sessions FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reception','marketing']::public.app_role[]
  ));

DROP POLICY IF EXISTS "Staff can read concierge messages in active property" ON public.ai_concierge_messages;
CREATE POLICY "Concierge messages read in active property"
  ON public.ai_concierge_messages FOR SELECT TO authenticated
  USING (public.staynas_ai_session_in_active_property(
    session_id, ARRAY['owner','manager','admin','reception','marketing']::public.app_role[]
  ));
