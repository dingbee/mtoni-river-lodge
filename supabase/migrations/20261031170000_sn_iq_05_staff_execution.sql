-- Ensure the task ledger has a durable property boundary before execution actions.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
UPDATE public.ops_tasks t SET property_id = b.property_id
FROM public.bookings b WHERE t.booking_id = b.id AND t.property_id IS NULL;
UPDATE public.ops_tasks t SET property_id = rs.property_id
FROM public.room_states rs WHERE t.room_state_id = rs.id AND t.property_id IS NULL;
CREATE INDEX IF NOT EXISTS ops_tasks_property_status_idx
  ON public.ops_tasks(property_id, status, priority, due_at);
DROP POLICY IF EXISTS "Staff manage ops_tasks" ON public.ops_tasks;
DROP POLICY IF EXISTS "Property staff manage operational tasks" ON public.ops_tasks;
CREATE POLICY "Property staff manage operational tasks" ON public.ops_tasks
  FOR ALL TO authenticated
  USING (property_id IS NOT NULL
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.is_any_staff(auth.uid()))
  WITH CHECK (property_id IS NOT NULL
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.is_any_staff(auth.uid()));

-- SN-IQ-05 workstream 3: staff assignment, task execution and guest request status.
-- Depends on the intake and dispatch migrations in this milestone.

ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_notes text,
  ADD COLUMN IF NOT EXISTS execution_updated_at timestamptz;

ALTER TABLE public.staynas_guest_requests
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.staynas_update_guest_request_status(
  _request_id uuid,
  _status text,
  _note text DEFAULT NULL
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
    OR NOT public.is_any_staff(_uid) THEN
    RAISE EXCEPTION 'Active property staff access required';
  END IF;
  IF _status NOT IN ('received','triaged','assigned','in_progress','fulfilled','cancelled','escalated') THEN
    RAISE EXCEPTION 'Invalid guest request status';
  END IF;
  SELECT * INTO _request FROM public.staynas_guest_requests
  WHERE id = _request_id AND property_id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest request not found'; END IF;
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
  _task_id uuid,
  _action text,
  _assignee_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
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
    OR NOT public.is_any_staff(_uid) THEN
    RAISE EXCEPTION 'Active property staff access required';
  END IF;
  SELECT * INTO _task FROM public.ops_tasks
  WHERE id = _task_id AND property_id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operational task not found'; END IF;

  IF _action = 'assign' THEN
    IF NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception']::public.app_role[]) THEN
      RAISE EXCEPTION 'Supervisor permission required to assign tasks';
    END IF;
    IF _assignee_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id = _property_id AND pm.user_id = _assignee_id
        AND pm.status = 'active' AND public.is_any_staff(pm.user_id)
    ) THEN RAISE EXCEPTION 'Assignee must be active staff of this property'; END IF;
    UPDATE public.ops_tasks SET assignee_id = _assignee_id, status = 'pending'
    WHERE id = _task_id;
  ELSIF _action = 'accept' THEN
    IF _task.assignee_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Only the assigned staff member can accept this task'; END IF;
    IF _task.status NOT IN ('pending','assigned') THEN RAISE EXCEPTION 'Task cannot be accepted from its current state'; END IF;
    UPDATE public.ops_tasks SET status = 'in_progress', accepted_at = now(), accepted_by = _uid,
      started_at = COALESCE(started_at,now()), started_by = COALESCE(started_by,_uid)
    WHERE id = _task_id;
  ELSIF _action = 'start' THEN
    IF _task.assignee_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Only the assigned staff member can start this task'; END IF;
    IF _task.status NOT IN ('pending','assigned','in_progress') THEN RAISE EXCEPTION 'Task cannot be started from its current state'; END IF;
    UPDATE public.ops_tasks SET status = 'in_progress', started_at = COALESCE(started_at,now()),
      started_by = COALESCE(started_by,_uid) WHERE id = _task_id;
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
    UPDATE public.ops_tasks SET execution_notes = NULLIF(_note,''), execution_updated_at = now()
    WHERE id = _task_id;
  ELSE RAISE EXCEPTION 'Unsupported task action'; END IF;

  SELECT gr.id, gr.status INTO _request_id, _request_status
  FROM public.staynas_guest_requests gr WHERE gr.operational_task_id = _task_id LIMIT 1;
  IF _request_id IS NOT NULL THEN
    IF _action IN ('accept','start') THEN
      UPDATE public.staynas_guest_requests SET status = 'in_progress',
        status_updated_by = _uid, updated_at = now() WHERE id = _request_id;
      _request_status := 'in_progress';
    ELSIF _action = 'complete' THEN
      UPDATE public.staynas_guest_requests SET status = 'fulfilled',
        status_updated_by = _uid, updated_at = now() WHERE id = _request_id;
      _request_status := 'fulfilled';
    ELSIF _action = 'assign' THEN
      UPDATE public.staynas_guest_requests SET status = 'assigned',
        status_updated_by = _uid, updated_at = now() WHERE id = _request_id;
      _request_status := 'assigned';
    END IF;
  END IF;
  RETURN QUERY SELECT _task_id,
    (SELECT t.status::text FROM public.ops_tasks t WHERE t.id = _task_id),
    _request_id, _request_status;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_update_guest_request_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_update_guest_task_execution(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_update_guest_request_status(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_update_guest_task_execution(uuid,text,uuid,text) TO authenticated, service_role;
