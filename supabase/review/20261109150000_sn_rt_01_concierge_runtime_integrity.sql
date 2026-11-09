BEGIN;

-- Leads must be property-owned. Existing unassigned rows are not guessed or
-- reassigned: review/application fails until every historical row is resolved.
DO $lead_ownership$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_concierge_leads WHERE property_id IS NULL) THEN
    RAISE EXCEPTION 'SN-RT-01: unowned Concierge leads exist; refusing implicit property assignment';
  END IF;
  ALTER TABLE public.ai_concierge_leads ALTER COLUMN property_id SET NOT NULL;
END
$lead_ownership$;

ALTER TABLE public.ai_concierge_leads
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_version text;

CREATE UNIQUE INDEX IF NOT EXISTS ai_concierge_leads_idempotency_key_uidx
  ON public.ai_concierge_leads(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $lead_consent$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_concierge_leads_consent_required'
      AND conrelid = 'public.ai_concierge_leads'::regclass
  ) THEN
    ALTER TABLE public.ai_concierge_leads
      ADD CONSTRAINT ai_concierge_leads_consent_required
      CHECK (consent_at IS NOT NULL AND consent_version IS NOT NULL) NOT VALID;
  END IF;
END
$lead_consent$;

-- Escalations carry an explicit property owner and a property/session composite
-- relationship. Historical rows are associated only through their own session.
ALTER TABLE public.ai_escalations
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ops_task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL;

UPDATE public.ai_escalations escalation
SET property_id = session.property_id
FROM public.ai_concierge_sessions session
WHERE escalation.session_id = session.id
  AND escalation.property_id IS NULL;

UPDATE public.ai_escalations
SET dedupe_key = id::text
WHERE dedupe_key IS NULL;

DO $escalation_integrity$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_escalations WHERE property_id IS NULL OR dedupe_key IS NULL) THEN
    RAISE EXCEPTION 'SN-RT-01: unowned or undeduplicated escalations exist; refusing unsafe backfill';
  END IF;
  ALTER TABLE public.ai_escalations ALTER COLUMN property_id SET NOT NULL;
  ALTER TABLE public.ai_escalations ALTER COLUMN dedupe_key SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_escalations_property_id_fkey'
      AND conrelid = 'public.ai_escalations'::regclass
  ) THEN
    ALTER TABLE public.ai_escalations
      ADD CONSTRAINT ai_escalations_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_escalations_session_property_fkey'
      AND conrelid = 'public.ai_escalations'::regclass
  ) THEN
    ALTER TABLE public.ai_escalations
      ADD CONSTRAINT ai_escalations_session_property_fkey
      FOREIGN KEY (session_id, property_id)
      REFERENCES public.ai_concierge_sessions(id, property_id)
      ON DELETE RESTRICT;
  END IF;
END
$escalation_integrity$;

CREATE UNIQUE INDEX IF NOT EXISTS ai_escalations_property_dedupe_uidx
  ON public.ai_escalations(property_id, dedupe_key);
CREATE INDEX IF NOT EXISTS ai_escalations_property_status_priority_idx
  ON public.ai_escalations(property_id, status, priority, created_at DESC);

DROP POLICY IF EXISTS "Escalations read in active property" ON public.ai_escalations;
DROP POLICY IF EXISTS "Escalations manage in active property" ON public.ai_escalations;
CREATE POLICY "Escalations read in active property"
  ON public.ai_escalations FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Escalations manage in active property"
  ON public.ai_escalations FOR ALL TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ))
  WITH CHECK (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ));

-- One atomic service-only operation creates the escalation, operations task and
-- in-app staff notifications. A duplicate request returns the original record.
CREATE OR REPLACE FUNCTION public.staynas_create_concierge_escalation(
  p_property_id uuid,
  p_session_id uuid,
  p_guest_id uuid,
  p_reason text,
  p_summary text,
  p_ai_confidence numeric,
  p_priority smallint,
  p_dedupe_key text
)
RETURNS TABLE(escalation_id uuid, task_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_escalation_id uuid;
  v_task_id uuid;
BEGIN
  IF p_property_id IS NULL OR p_session_id IS NULL
     OR p_dedupe_key IS NULL OR length(p_dedupe_key) < 16
     OR p_reason NOT IN ('low_confidence','complaint','payment_issue','complex_request','human_requested','other')
     OR p_priority NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Invalid Concierge escalation contract' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.staynas_ai_property_in_active_context(
    p_property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Active property authorization is required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties property
    JOIN public.ai_concierge_sessions session ON session.property_id = property.id
    WHERE property.id = p_property_id
      AND property.status = 'active'
      AND session.id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Concierge session does not belong to the active property'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.ai_escalations(
    property_id, session_id, guest_id, channel, reason, summary,
    ai_confidence, priority, status, dedupe_key
  )
  VALUES (
    p_property_id, p_session_id, p_guest_id, 'web', p_reason,
    left(coalesce(p_summary, ''), 2000), p_ai_confidence,
    p_priority, 'open', p_dedupe_key
  )
  ON CONFLICT (property_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_escalation_id;

  IF v_escalation_id IS NULL THEN
    SELECT e.id INTO v_escalation_id
    FROM public.ai_escalations e
    WHERE e.property_id = p_property_id AND e.dedupe_key = p_dedupe_key;
    RETURN QUERY SELECT v_escalation_id, NULL::uuid, false;
    RETURN;
  END IF;

  INSERT INTO public.ops_tasks(
    property_id, task_type, title, description, category, priority, status
  )
  VALUES (
    p_property_id, 'concierge_escalation',
    'Guest Concierge escalation',
    left(coalesce(p_summary, 'A guest requested assistance from the Concierge.'), 2000),
    'concierge', p_priority, 'pending'
  )
  RETURNING id INTO v_task_id;

  UPDATE public.ai_escalations SET ops_task_id = v_task_id WHERE id = v_escalation_id;

  INSERT INTO public.notifications(user_id, channel, title, body, href, kind, meta)
  SELECT member.user_id, 'in_app', 'Guest needs assistance',
    'A guest Concierge conversation requires staff attention.',
    '/admin/guests/messages', 'concierge_escalation',
    jsonb_build_object(
      'property_id', p_property_id,
      'escalation_id', v_escalation_id,
      'task_id', v_task_id,
      'session_id', p_session_id
    )
  FROM public.staynas_property_members member
  WHERE member.property_id = p_property_id
    AND member.status = 'active'
    AND member.role::text IN ('owner','manager','admin','reservations','reception');

  RETURN QUERY SELECT v_escalation_id, v_task_id, true;
END
$function$;

REVOKE ALL ON FUNCTION public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,numeric,smallint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,numeric,smallint,text)
  TO authenticated, service_role;

COMMIT;
