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
  ON public.ai_concierge_leads(idempotency_key);

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

-- RLS does not constrain TRUNCATE. Anonymous callers receive no table
-- privileges; staff retain only the reads/lead updates used by the application.
REVOKE ALL ON TABLE
  public.ai_concierge_sessions,
  public.ai_concierge_messages,
  public.ai_concierge_leads,
  public.ai_escalations
FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.ai_concierge_sessions,
  public.ai_concierge_messages,
  public.ai_concierge_leads,
  public.ai_escalations
FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_escalations FROM authenticated;
GRANT SELECT ON TABLE
  public.ai_concierge_sessions,
  public.ai_concierge_messages,
  public.ai_escalations
TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.ai_concierge_leads TO authenticated;

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
  p_channel text,
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
     OR p_channel IS NULL OR p_channel NOT IN ('web','whatsapp','email')
     OR p_reason IS NULL OR p_reason NOT IN ('low_confidence','complaint','payment_issue','complex_request','human_requested','other')
     OR p_priority IS NULL OR p_priority NOT BETWEEN 1 AND 3 THEN
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
      AND (p_guest_id IS NULL OR session.guest_id = p_guest_id)
  ) THEN
    RAISE EXCEPTION 'Concierge session does not belong to the active property'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.ai_escalations(
    property_id, session_id, guest_id, channel, reason, summary,
    ai_confidence, priority, status, dedupe_key
  )
  VALUES (
    p_property_id, p_session_id, p_guest_id, p_channel, p_reason,
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

REVOKE ALL ON FUNCTION public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,text,numeric,smallint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,text,numeric,smallint,text)
  TO authenticated, service_role;


-- Durable guest-facing status updates are emitted only through an active,
-- outbound-enabled channel. The current web channel delivers into the session.
CREATE TABLE IF NOT EXISTS public.ai_escalation_guest_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  escalation_id uuid NOT NULL REFERENCES public.ai_escalations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('assigned','in_progress','resolved','dismissed')),
  channel text NOT NULL CHECK (channel IN ('web','email','whatsapp')),
  delivery_status text NOT NULL CHECK (delivery_status IN ('sent','not_configured','failed')),
  message_id uuid REFERENCES public.ai_concierge_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (escalation_id, status, channel)
);
ALTER TABLE public.ai_escalation_guest_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_escalation_guest_notifications FROM PUBLIC, anon;
GRANT SELECT ON public.ai_escalation_guest_notifications TO authenticated;
GRANT ALL ON public.ai_escalation_guest_notifications TO service_role;
CREATE POLICY "Escalation guest notifications read in active property"
  ON public.ai_escalation_guest_notifications FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]
  ));

CREATE OR REPLACE FUNCTION public.staynas_transition_concierge_escalation(
  p_escalation_id uuid,
  p_property_id uuid,
  p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_resolution_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_escalation public.ai_escalations%ROWTYPE;
  v_next_status text;
  v_message text;
  v_message_id uuid;
  v_web_enabled boolean;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.staynas_ai_property_in_active_context(
    p_property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Active property authorization is required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open','assigned','in_progress','resolved','dismissed') THEN
    RAISE EXCEPTION 'Invalid escalation status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_escalation
  FROM public.ai_escalations
  WHERE id = p_escalation_id AND property_id = p_property_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escalation not found in active property' USING ERRCODE = 'P0002';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members member
    WHERE member.property_id = p_property_id
      AND member.user_id = p_assigned_to
      AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Assignee must be an active member of the property' USING ERRCODE = '42501';
  END IF;

  IF v_escalation.status IN ('resolved','dismissed')
     AND p_status IS NOT NULL AND p_status <> v_escalation.status THEN
    RAISE EXCEPTION 'Closed escalations cannot be reopened' USING ERRCODE = '23514';
  END IF;

  v_next_status := coalesce(p_status, v_escalation.status);
  UPDATE public.ai_escalations
  SET status = v_next_status,
      assigned_to = CASE WHEN p_assigned_to IS NOT NULL THEN p_assigned_to ELSE assigned_to END,
      resolution_notes = CASE WHEN p_resolution_notes IS NOT NULL THEN left(p_resolution_notes,2000) ELSE resolution_notes END,
      acknowledged_at = CASE
        WHEN v_next_status IN ('assigned','in_progress') THEN coalesce(acknowledged_at, now())
        ELSE acknowledged_at
      END,
      acknowledged_by = CASE
        WHEN v_next_status IN ('assigned','in_progress') THEN coalesce(acknowledged_by, auth.uid())
        ELSE acknowledged_by
      END,
      resolved_at = CASE
        WHEN v_next_status IN ('resolved','dismissed') THEN coalesce(resolved_at, now())
        ELSE resolved_at
      END,
      updated_at = now()
  WHERE id = p_escalation_id AND property_id = p_property_id;

  IF v_escalation.ops_task_id IS NOT NULL THEN
    UPDATE public.ops_tasks
    SET assigned_to = CASE WHEN p_assigned_to IS NOT NULL THEN p_assigned_to ELSE assigned_to END,
        status = CASE
          WHEN v_next_status = 'in_progress' THEN 'in_progress'::public.ops_task_status
          WHEN v_next_status = 'resolved' THEN 'completed'::public.ops_task_status
          WHEN v_next_status = 'dismissed' THEN 'cancelled'::public.ops_task_status
          ELSE status
        END,
        completed_at = CASE WHEN v_next_status = 'resolved' THEN coalesce(completed_at,now()) ELSE completed_at END,
        completed_by = CASE WHEN v_next_status = 'resolved' THEN coalesce(completed_by,auth.uid()) ELSE completed_by END,
        updated_at = now()
    WHERE id = v_escalation.ops_task_id AND property_id = p_property_id;
  END IF;

  IF v_next_status IN ('assigned','in_progress','resolved','dismissed')
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_escalation_guest_notifications notification
       WHERE notification.escalation_id = p_escalation_id
         AND notification.status = v_next_status
         AND notification.channel = 'web'
     ) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ai_concierge_channels
      WHERE channel = 'web' AND status = 'active' AND outbound_enabled = true
    ) INTO v_web_enabled;

    IF v_web_enabled THEN
      v_message := CASE v_next_status
        WHEN 'assigned' THEN 'The property team has received your request and is arranging assistance.'
        WHEN 'in_progress' THEN 'A member of the property team is now working on your request.'
        WHEN 'resolved' THEN 'The property team has marked your request as resolved. Send another message if you still need help.'
        ELSE 'The property team has closed this request. Send another message if you still need assistance.'
      END;
      INSERT INTO public.ai_concierge_messages(session_id,role,content,confidence,escalated,model)
      VALUES (v_escalation.session_id,'assistant',v_message,1.0,false,'staynas-concierge-handoff')
      RETURNING id INTO v_message_id;

      INSERT INTO public.ai_escalation_guest_notifications(
        property_id,escalation_id,session_id,status,channel,delivery_status,message_id,delivered_at
      )
      VALUES (p_property_id,p_escalation_id,v_escalation.session_id,v_next_status,'web','sent',v_message_id,now());
    ELSE
      INSERT INTO public.ai_escalation_guest_notifications(
        property_id,escalation_id,session_id,status,channel,delivery_status
      )
      VALUES (p_property_id,p_escalation_id,v_escalation.session_id,v_next_status,'web','not_configured');
    END IF;
  END IF;

  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.staynas_transition_concierge_escalation(uuid,uuid,text,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_transition_concierge_escalation(uuid,uuid,text,uuid,text)
  TO authenticated, service_role;

-- Durable, server-only rate limiting for anonymous Concierge endpoints.
CREATE TABLE IF NOT EXISTS public.staynas_public_api_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staynas_public_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_public_api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_public_api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_consume_public_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[a-f0-9]{64}
     OR p_limit < 1 OR p_limit > 1000
     OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid public rate limit contract' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staynas_public_api_rate_limits(key_hash, window_started_at, request_count)
  VALUES (p_key_hash, now(), 1)
  ON CONFLICT (key_hash) DO UPDATE
  SET window_started_at = CASE
        WHEN public.staynas_public_api_rate_limits.window_started_at
          + make_interval(secs => p_window_seconds) <= now()
        THEN now()
        ELSE public.staynas_public_api_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN public.staynas_public_api_rate_limits.window_started_at
          + make_interval(secs => p_window_seconds) <= now()
        THEN 1
        ELSE public.staynas_public_api_rate_limits.request_count + 1
      END,
      updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END
$function$;

REVOKE ALL ON FUNCTION public.staynas_consume_public_rate_limit(text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_consume_public_rate_limit(text,integer,integer)
  TO service_role;

COMMIT;
