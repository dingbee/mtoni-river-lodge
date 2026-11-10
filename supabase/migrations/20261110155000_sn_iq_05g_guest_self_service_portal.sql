-- SN-IQ-05G — secure in-stay guest self-service portal.
-- Extends the existing SN-IQ-05 request ledger and HK-X execution path.
-- No guest-facing table grants, anonymous RLS access, or replacement task system.

BEGIN;

ALTER TABLE public.staynas_guest_requests
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_submission_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS staynas_guest_requests_client_submission_uidx
  ON public.staynas_guest_requests(property_id, client_submission_id);

-- Guest portal credentials are independent of booking references and online
-- check-in tokens. Only a SHA-256 hash is stored; the bearer token is shown once.
CREATE TABLE IF NOT EXISTS public.staynas_guest_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  concierge_session_id uuid REFERENCES public.ai_concierge_sessions(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS staynas_guest_portal_access_booking_idx
  ON public.staynas_guest_portal_access(property_id, booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_guest_portal_access_active_idx
  ON public.staynas_guest_portal_access(token_hash, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.staynas_guest_portal_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_guest_portal_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_guest_portal_access TO service_role;

-- Private, server-authorized photo storage. No anon/authenticated object policy
-- is created; uploads and signed reads are issued only after portal-token checks.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guest-request-evidence',
  'guest-request-evidence',
  false,
  8388608,
  ARRAY['image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[];

-- Preserve a durable status timeline and operational-task lineage in the
-- existing request metadata rather than introducing a parallel request ledger.
CREATE OR REPLACE FUNCTION public.staynas_guest_request_audit_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _history jsonb;
  _tasks jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{status_history}',
      jsonb_build_array(jsonb_build_object(
        'status', NEW.status,
        'note', COALESCE(NULLIF(NEW.status_note, ''), 'Request received'),
        'actor_id', NEW.status_updated_by,
        'occurred_at', now()
      )),
      true
    );
    RETURN NEW;
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, OLD.metadata, '{}'::jsonb);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _history := COALESCE(OLD.metadata->'status_history', '[]'::jsonb);
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{status_history}',
      _history || jsonb_build_array(jsonb_build_object(
        'status', NEW.status,
        'note', NULLIF(NEW.status_note, ''),
        'actor_id', NEW.status_updated_by,
        'occurred_at', now()
      )),
      true
    );
  END IF;

  IF NEW.operational_task_id IS DISTINCT FROM OLD.operational_task_id
     AND NEW.operational_task_id IS NOT NULL THEN
    _tasks := COALESCE(OLD.metadata->'operational_task_history', '[]'::jsonb);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_tasks) AS task_items(task)
      WHERE task->>'task_id' = NEW.operational_task_id::text
    ) THEN
      NEW.metadata := jsonb_set(
        NEW.metadata,
        '{operational_task_history}',
        _tasks || jsonb_build_array(jsonb_build_object(
          'task_id', NEW.operational_task_id,
          'linked_at', now()
        )),
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_audit_metadata ON public.staynas_guest_requests;
CREATE TRIGGER staynas_guest_request_audit_metadata
  BEFORE INSERT OR UPDATE OF status, operational_task_id
  ON public.staynas_guest_requests
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guest_request_audit_metadata();

-- Reuse the existing staff notification queue and realtime subscription.
-- Guest-facing updates are read from the request's actual lifecycle history.
CREATE OR REPLACE FUNCTION public.staynas_queue_guest_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _summary text;
BEGIN
  IF NEW.booking_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    _event := 'guest_request_received';
    _summary := 'New guest ' || replace(NEW.category, '_', ' ') || ' request';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := 'guest_request_status_changed';
    _summary := 'Guest request ' || replace(NEW.status, '_', ' ');
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.pending_notifications (booking_id, event_type, payload)
  VALUES (
    NEW.booking_id,
    _event,
    jsonb_build_object(
      'request_id', NEW.id,
      'category', NEW.category,
      'status', NEW.status,
      'summary', _summary,
      'request_summary', left(NEW.request_text, 160)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_notification_insert ON public.staynas_guest_requests;
DROP TRIGGER IF EXISTS staynas_guest_request_notification_status ON public.staynas_guest_requests;
CREATE TRIGGER staynas_guest_request_notification_insert
  AFTER INSERT ON public.staynas_guest_requests
  FOR EACH ROW EXECUTE FUNCTION public.staynas_queue_guest_request_notification();
CREATE TRIGGER staynas_guest_request_notification_status
  AFTER UPDATE OF status ON public.staynas_guest_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.staynas_queue_guest_request_notification();

-- HK-X execution is the sole authority for housekeeping progress. Cleaning-task
-- completion is not guest-request completion; the request stays in progress
-- until the supervisor's actual room-readiness inspection passes.
CREATE OR REPLACE FUNCTION public.staynas_sync_housekeeping_guest_request_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category <> 'housekeeping' OR NEW.room_state_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.task_type = 'housekeeping_reclean' THEN
    UPDATE public.staynas_guest_requests gr
    SET operational_task_id = NEW.id,
        status_note = 'Housekeeping is re-cleaning the room after inspection.',
    updated_at = now()
    WHERE gr.category = 'housekeeping'
      AND gr.room_state_id = NEW.room_state_id
      AND gr.operational_task_id IN (
        SELECT hi.cleaning_task_id
        FROM public.housekeeping_inspections hi
        WHERE hi.room_state_id = NEW.room_state_id AND hi.status = 'failed'
      )
      AND gr.status NOT IN ('fulfilled','cancelled');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_hk_reclean_trace ON public.ops_tasks;
CREATE TRIGGER staynas_guest_request_hk_reclean_trace
  AFTER INSERT ON public.ops_tasks
  FOR EACH ROW
  WHEN (NEW.category = 'housekeeping' AND NEW.task_type = 'housekeeping_reclean')
  EXECUTE FUNCTION public.staynas_sync_housekeeping_guest_request_task();

CREATE OR REPLACE FUNCTION public.staynas_sync_housekeeping_guest_request_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category <> 'housekeeping' OR NEW.room_state_id IS NULL
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'in_progress' THEN
    UPDATE public.staynas_guest_requests
    SET status = 'in_progress',
        status_note = 'Housekeeping is working on your request.',
        status_updated_by = COALESCE(NEW.started_by, NEW.assignee_id),
        updated_at = now()
    WHERE operational_task_id = NEW.id
      AND room_state_id = NEW.room_state_id
      AND status NOT IN ('fulfilled','cancelled');
  ELSIF NEW.status = 'completed' THEN
    UPDATE public.staynas_guest_requests
    SET status_note = 'Housekeeping work is complete and is awaiting the final room inspection.',
        status_updated_by = NEW.completed_by,
        updated_at = now()
    WHERE operational_task_id = NEW.id
      AND property_id = NEW.property_id
      AND status NOT IN ('fulfilled','cancelled');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_hk_task_progress ON public.ops_tasks;
CREATE TRIGGER staynas_guest_request_hk_task_progress
  AFTER UPDATE OF status ON public.ops_tasks
  FOR EACH ROW
  WHEN (NEW.category = 'housekeeping')
  EXECUTE FUNCTION public.staynas_sync_housekeeping_guest_request_progress();

CREATE OR REPLACE FUNCTION public.staynas_sync_housekeeping_guest_request_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room_state public.room_states%ROWTYPE;
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('passed','failed') THEN RETURN NEW; END IF;

  SELECT * INTO _room_state
  FROM public.room_states
  WHERE id = NEW.room_state_id
  FOR UPDATE;
  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = NEW.cleaning_task_id;

  IF NOT FOUND OR _task.category <> 'housekeeping' THEN RETURN NEW; END IF;

  IF NEW.status = 'passed' AND _room_state.state = 'vacant_clean' THEN
    UPDATE public.staynas_guest_requests
    SET status = 'fulfilled',
        status_note = 'Housekeeping is complete and the room passed its final inspection.',
        status_updated_by = NEW.inspector_id,
        updated_at = now()
    WHERE operational_task_id = NEW.cleaning_task_id
      AND room_state_id = NEW.room_state_id
      AND property_id = _room_state.property_id
      AND category = 'housekeeping'
      AND status NOT IN ('fulfilled','cancelled');
  ELSIF NEW.status = 'failed' THEN
    UPDATE public.staynas_guest_requests
    SET status_note = 'The room did not pass inspection. Housekeeping is following up.',
        status_updated_by = NEW.inspector_id,
        updated_at = now()
    WHERE operational_task_id = NEW.cleaning_task_id
      AND room_state_id = NEW.room_state_id
      AND property_id = _room_state.property_id
      AND category = 'housekeeping'
      AND status NOT IN ('fulfilled','cancelled');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_hk_inspection_sync ON public.housekeeping_inspections;
CREATE TRIGGER staynas_guest_request_hk_inspection_sync
  AFTER UPDATE OF status ON public.housekeeping_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.staynas_sync_housekeeping_guest_request_inspection();

-- Strengthen the dedicated HK-X dispatch lookup: the room-state must match the
-- booking's current room as well as its property and booking identity.
CREATE OR REPLACE FUNCTION public.staynas_dispatch_housekeeping_request(_request_id uuid)
RETURNS TABLE(request_id uuid, task_id uuid, request_status text, task_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _request public.staynas_guest_requests%ROWTYPE;
  _room_state_id uuid;
  _task_id uuid;
  _task_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid, _property_id)
     OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception']::public.app_role[])
  THEN RAISE EXCEPTION 'Property supervisor access required'; END IF;

  SELECT * INTO _request
  FROM public.staynas_guest_requests
  WHERE id = _request_id AND property_id = _property_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest request not found in active property'; END IF;
  IF _request.category <> 'housekeeping' THEN
    RAISE EXCEPTION 'Only housekeeping requests can enter the housekeeping workflow'; END IF;
  IF _request.status IN ('cancelled','fulfilled') THEN
    RAISE EXCEPTION 'Closed guest request cannot be dispatched'; END IF;

  IF _request.operational_task_id IS NOT NULL THEN
    SELECT t.id, t.status::text INTO _task_id, _task_status
    FROM public.ops_tasks t
    WHERE t.id = _request.operational_task_id
      AND t.property_id = _property_id
      AND t.category = 'housekeeping';
    IF _task_id IS NOT NULL THEN
      RETURN QUERY SELECT _request.id, _task_id, _request.status, _task_status;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Linked task is not a housekeeping task in this property';
  END IF;

  IF _request.booking_id IS NULL THEN
    RAISE EXCEPTION 'A booking-linked room is required before housekeeping dispatch'; END IF;

  SELECT rs.id INTO _room_state_id
  FROM public.room_states rs
  JOIN public.bookings b ON b.id = rs.booking_id
  WHERE b.id = _request.booking_id
    AND b.property_id = _property_id
    AND rs.property_id = _property_id
    AND rs.room_id = b.room_id
    AND (_request.room_state_id IS NULL OR rs.id = _request.room_state_id)
  ORDER BY rs.updated_at DESC
  LIMIT 1
  FOR UPDATE OF rs;

  IF _room_state_id IS NULL THEN
    RAISE EXCEPTION 'No room state matches this booking, property and assigned room'; END IF;

  INSERT INTO public.ops_tasks (
    property_id, booking_id, room_state_id, task_type, category,
    title, description, priority, status, due_at
  ) VALUES (
    _property_id, _request.booking_id, _room_state_id, 'guest_request_housekeeping',
    'housekeeping', 'Guest request: housekeeping', _request.request_text,
    _request.priority, 'pending',
    COALESCE(_request.requested_for, now() + interval '30 minutes')
  ) RETURNING id, status::text INTO _task_id, _task_status;

  UPDATE public.staynas_guest_requests
  SET room_state_id = _room_state_id,
      operational_task_id = _task_id,
      dispatched_at = COALESCE(dispatched_at, now()),
      dispatched_by = COALESCE(dispatched_by, _uid),
      status = 'assigned',
      status_updated_by = _uid,
      status_note = 'Housekeeping has received your request.',
      updated_at = now()
  WHERE id = _request.id;

  RETURN QUERY SELECT _request.id, _task_id, 'assigned'::text, _task_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_guest_request_add_attachment(
  _request_id uuid,
  _property_id uuid,
  _booking_id uuid,
  _attachment jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _metadata jsonb;
  _attachments jsonb;
  _path text;
BEGIN
  IF jsonb_typeof(_attachment) <> 'object'
     OR NULLIF(_attachment->>'path', '') IS NULL
     OR NULLIF(_attachment->>'mime_type', '') IS NULL THEN
    RAISE EXCEPTION 'Invalid guest request attachment metadata';
  END IF;

  _path := _attachment->>'path';
  SELECT metadata INTO _metadata
  FROM public.staynas_guest_requests
  WHERE id = _request_id
    AND property_id = _property_id
    AND booking_id = _booking_id
    AND status NOT IN ('fulfilled','cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Open guest request not found in this booking and property'; END IF;

  _attachments := COALESCE(_metadata->'attachments', '[]'::jsonb);
  IF jsonb_typeof(_attachments) <> 'array' THEN
    RAISE EXCEPTION 'Guest request attachment metadata is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_attachments) AS attachment_items(item)
    WHERE item->>'path' = _path
  ) THEN
    RETURN true;
  END IF;

  IF jsonb_array_length(_attachments) >= 6 THEN
    RAISE EXCEPTION 'A request can contain no more than six photographs';
  END IF;

  UPDATE public.staynas_guest_requests
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{attachments}',
    _attachments || jsonb_build_array(_attachment),
    true
  )
  WHERE id = _request_id
    AND property_id = _property_id
    AND booking_id = _booking_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_guest_request_add_attachment(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_guest_request_add_attachment(uuid,uuid,uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.staynas_queue_guest_request_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_sync_housekeeping_guest_request_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_sync_housekeeping_guest_request_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_sync_housekeeping_guest_request_inspection() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guest_request_audit_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_dispatch_housekeeping_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_dispatch_housekeeping_request(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.staynas_guest_portal_access IS
'Hashed, expiring and revocable bearer credentials for an in-stay guest portal; server-side access only.';
COMMENT ON COLUMN public.staynas_guest_requests.room_state_id IS
'Exact booking/property/room state used by HK-X dispatch; not inferred from a guest-supplied room identifier.';

COMMIT;
