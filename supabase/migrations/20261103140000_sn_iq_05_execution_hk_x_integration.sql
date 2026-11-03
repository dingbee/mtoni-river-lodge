-- SN-IQ-05 integrated staff execution and HK-X guest-request bridge.
-- property_id and operational_task_id were introduced by the preceding dispatch migration;
-- this migration only adds execution metadata and the dedicated HK room-state link.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_notes text,
  ADD COLUMN IF NOT EXISTS execution_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL;

ALTER TABLE public.staynas_guest_requests
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_tasks_housekeeping_property_room_idx
  ON public.ops_tasks(property_id, room_state_id, status)
  WHERE category = 'housekeeping';

-- A housekeeping operational task must be attached to a room-state record.
-- This prevents generic guest-request dispatch from creating an orphan HK task.
CREATE OR REPLACE FUNCTION public.staynas_require_housekeeping_room_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category = 'housekeeping' AND NEW.room_state_id IS NULL THEN
    RAISE EXCEPTION 'Housekeeping tasks must be linked to a room state and dispatched through HK-X';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ops_tasks_require_hk_room_state ON public.ops_tasks;
CREATE TRIGGER ops_tasks_require_hk_room_state
  BEFORE INSERT OR UPDATE OF category, room_state_id ON public.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION public.staynas_require_housekeeping_room_state();

CREATE OR REPLACE FUNCTION public.staynas_dispatch_housekeeping_request(_request_id uuid)
RETURNS TABLE(request_id uuid, task_id uuid, request_status text, task_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid, _property_id)
    OR NOT public.is_any_staff(_uid)
    OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception']::public.app_role[])
  THEN RAISE EXCEPTION 'Property supervisor access required'; END IF;

  SELECT * INTO _request FROM public.staynas_guest_requests
  WHERE id = _request_id AND property_id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest request not found in active property'; END IF;
  IF _request.category <> 'housekeeping' THEN
    RAISE EXCEPTION 'Only housekeeping requests can enter the housekeeping workflow';
  END IF;
  IF _request.status IN ('cancelled','fulfilled') THEN
    RAISE EXCEPTION 'Closed guest request cannot be dispatched';
  END IF;

  IF _request.operational_task_id IS NOT NULL THEN
    SELECT t.id, t.status::text INTO _task_id, _task_status
    FROM public.ops_tasks t
    WHERE t.id = _request.operational_task_id
      AND t.property_id = _property_id AND t.category = 'housekeeping';
    IF _task_id IS NOT NULL THEN
      RETURN QUERY SELECT _request.id, _task_id, _request.status, _task_status;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Linked task is not a housekeeping task in this property';
  END IF;
  IF _request.booking_id IS NULL THEN
    RAISE EXCEPTION 'A booking-linked room is required before housekeeping dispatch';
  END IF;

  SELECT rs.id INTO _room_state_id
  FROM public.room_states rs
  JOIN public.bookings b ON b.id = rs.booking_id
  WHERE b.id = _request.booking_id AND b.property_id = _property_id
    AND rs.property_id = _property_id
  ORDER BY rs.updated_at DESC LIMIT 1 FOR UPDATE OF rs;
  IF _room_state_id IS NULL THEN
    RAISE EXCEPTION 'No room state is linked to this booking; assign the room before dispatch';
  END IF;

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
  SET operational_task_id = _task_id, dispatched_at = COALESCE(dispatched_at, now()),
      dispatched_by = COALESCE(dispatched_by, _uid), status = 'assigned',
      status_updated_by = _uid, updated_at = now()
  WHERE id = _request.id;
  RETURN QUERY SELECT _request.id, _task_id, 'assigned'::text, _task_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_update_guest_request_status(
  _request_id uuid, _status text, _note text DEFAULT NULL
)
RETURNS TABLE(request_id uuid, request_status text, task_id uuid, task_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _request public.staynas_guest_requests%ROWTYPE;
  _task_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid, _property_id)
    OR NOT public.is_any_staff(_uid) THEN RAISE EXCEPTION 'Active property staff access required'; END IF;
  IF _status NOT IN ('received','triaged','assigned','in_progress','fulfilled','cancelled','escalated') THEN
    RAISE EXCEPTION 'Invalid guest request status';
  END IF;
  SELECT * INTO _request FROM public.staynas_guest_requests
  WHERE id = _request_id AND property_id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest request not found'; END IF;
  IF _request.category = 'housekeeping' AND _status = 'fulfilled' THEN
    RAISE EXCEPTION 'Housekeeping requests are fulfilled only after HK-X inspection and room-readiness completion';
  END IF;
  IF _request.status IN ('fulfilled','cancelled') AND _status NOT IN (_request.status,'escalated') THEN
    RAISE EXCEPTION 'Closed guest request cannot be reopened through status update';
  END IF;
  IF _status IN ('assigned','in_progress','fulfilled') AND _request.operational_task_id IS NULL THEN
    RAISE EXCEPTION 'Dispatch the request before advancing its execution status';
  END IF;
  UPDATE public.staynas_guest_requests
  SET status = _status, status_note = NULLIF(_note,''), status_updated_by = _uid, updated_at = now()
  WHERE id = _request_id;
  IF _request.operational_task_id IS NOT NULL THEN
    SELECT status::text INTO _task_status FROM public.ops_tasks
    WHERE id = _request.operational_task_id AND property_id = _property_id;
  END IF;
  RETURN QUERY SELECT _request_id, _status, _request.operational_task_id, _task_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_update_guest_task_execution(
  _task_id uuid, _action text, _assignee_id uuid DEFAULT NULL, _note text DEFAULT NULL
)
RETURNS TABLE(task_id uuid, task_status text, request_id uuid, request_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _task public.ops_tasks%ROWTYPE;
  _request_id uuid;
  _request_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid, _property_id)
    OR NOT public.is_any_staff(_uid) THEN RAISE EXCEPTION 'Active property staff access required'; END IF;
  SELECT * INTO _task FROM public.ops_tasks
  WHERE id = _task_id AND property_id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operational task not found'; END IF;
  IF _task.category = 'housekeeping' AND _action <> 'note' THEN
    RAISE EXCEPTION 'Housekeeping execution is governed exclusively by the HK-X workflow';
  END IF;

  IF _action = 'assign' THEN
    IF NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception']::public.app_role[]) THEN
      RAISE EXCEPTION 'Supervisor permission required to assign tasks';
    END IF;
    IF _assignee_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id = _property_id AND pm.user_id = _assignee_id
        AND pm.status = 'active' AND public.is_any_staff(pm.user_id)
    ) THEN RAISE EXCEPTION 'Assignee must be active staff of this property'; END IF;
    UPDATE public.ops_tasks SET assignee_id = _assignee_id, status = 'pending' WHERE id = _task_id;
  ELSIF _action = 'accept' OR _action = 'start' THEN
    IF _task.assignee_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Only assigned staff can execute this task'; END IF;
    IF _task.status NOT IN ('pending','assigned','in_progress') THEN RAISE EXCEPTION 'Task cannot be started from its current state'; END IF;
    UPDATE public.ops_tasks SET status = 'in_progress',
      accepted_at = CASE WHEN _action = 'accept' THEN COALESCE(accepted_at,now()) ELSE accepted_at END,
      accepted_by = CASE WHEN _action = 'accept' THEN COALESCE(accepted_by,_uid) ELSE accepted_by END,
      started_at = COALESCE(started_at,now()), started_by = COALESCE(started_by,_uid)
    WHERE id = _task_id;
  ELSIF _action = 'complete' THEN
    IF _task.assignee_id IS DISTINCT FROM _uid AND NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[]) THEN
      RAISE EXCEPTION 'Only assigned staff or a supervisor can complete this task';
    END IF;
    IF _task.status NOT IN ('pending','assigned','in_progress') THEN RAISE EXCEPTION 'Task is already closed'; END IF;
    UPDATE public.ops_tasks SET status = 'completed', completed_at = now(),
      execution_notes = COALESCE(NULLIF(_note,''),execution_notes), execution_updated_at = now()
    WHERE id = _task_id;
  ELSIF _action = 'note' THEN
    IF _task.assignee_id IS DISTINCT FROM _uid AND NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[]) THEN
      RAISE EXCEPTION 'Only assigned staff or a supervisor can update execution notes';
    END IF;
    UPDATE public.ops_tasks SET execution_notes = NULLIF(_note,''), execution_updated_at = now() WHERE id = _task_id;
  ELSE RAISE EXCEPTION 'Unsupported task action'; END IF;

  SELECT gr.id, gr.status INTO _request_id, _request_status
  FROM public.staynas_guest_requests gr
  WHERE gr.operational_task_id = _task_id AND gr.property_id = _property_id LIMIT 1;
  IF _request_id IS NOT NULL THEN
    IF _action IN ('accept','start') THEN
      UPDATE public.staynas_guest_requests SET status = 'in_progress', status_updated_by = _uid, updated_at = now()
      WHERE id = _request_id AND category <> 'housekeeping';
      IF _task.category <> 'housekeeping' THEN _request_status := 'in_progress'; END IF;
    ELSIF _action = 'complete' THEN
      UPDATE public.staynas_guest_requests SET status = 'fulfilled', status_updated_by = _uid, updated_at = now()
      WHERE id = _request_id AND category <> 'housekeeping';
      IF _task.category <> 'housekeeping' THEN _request_status := 'fulfilled'; END IF;
    ELSIF _action = 'assign' THEN
      UPDATE public.staynas_guest_requests SET status = 'assigned', status_updated_by = _uid, updated_at = now()
      WHERE id = _request_id;
      _request_status := 'assigned';
    END IF;
  END IF;
  RETURN QUERY SELECT _task_id, (SELECT t.status::text FROM public.ops_tasks t WHERE t.id = _task_id), _request_id, _request_status;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_dispatch_housekeeping_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_update_guest_request_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_update_guest_task_execution(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_dispatch_housekeeping_request(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_update_guest_request_status(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_update_guest_task_execution(uuid,text,uuid,text) TO authenticated, service_role;
