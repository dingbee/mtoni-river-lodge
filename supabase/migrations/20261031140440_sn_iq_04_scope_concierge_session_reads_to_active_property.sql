DROP POLICY IF EXISTS "Staff can read concierge sessions" ON public.ai_concierge_sessions;
CREATE POLICY "Staff can read concierge sessions in active property"
ON public.ai_concierge_sessions
FOR SELECT
TO authenticated
USING (
  property_id IS NOT NULL
  AND public.staynas_ai_session_in_active_property(
    id,
    ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  )
);