-- HK-S2: Housekeeping staff execution
-- Execution is task-status based. Room readiness changes to inspection only on governed completion.

ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_tasks_housekeeping_work_idx
  ON public.ops_tasks(category, status, assignee_id, due_at)
  WHERE category = 'housekeeping';

CREATE INDEX IF NOT EXISTS ops_tasks_room_state_idx
  ON public.ops_tasks(room_state_id, status);

-- Backfill existing housekeeping tasks to their room state through the booking relationship.
UPDATE public.ops_tasks t
SET room_state_id = rs.id
FROM public.bookings b
JOIN public.room_states rs ON rs.booking_id = b.id
WHERE t.category = 'housekeeping'
  AND t.booking_id = b.id
  AND t.room_state_id IS NULL;

CREATE OR REPLACE FUNCTION public.housekeeping_is_supervisor(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_work(
  _mine_only boolean DEFAULT false,
  _include_completed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  room_state_id uuid,
  unit_label text,
  room_id uuid,
  room_name text,
  booking_id uuid,
  booking_reference text,
  guest_name text,
  status public.ops_task_status,
  priority integer,
  due_at timestamptz,
  assignee_id uuid,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  title text,
  description text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
     THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;

  RETURN QUERY
  SELECT t.id, rs.id, rs.unit_label, rs.room_id, r.name,
         t.booking_id, b.reference, b.guest_name, t.status, t.priority, t.due_at,
         t.assignee_id, t.claimed_at, t.started_at, t.completed_at, t.title, t.description
  FROM public.ops_tasks t
  JOIN public.room_states rs ON rs.id = t.room_state_id
  JOIN public.rooms r ON r.id = rs.room_id
  LEFT JOIN public.bookings b ON b.id = t.booking_id
  WHERE t.category = 'housekeeping'
    AND (_include_completed OR t.status IN ('pending','in_progress'))
    AND (NOT _mine_only OR t.assignee_id = _uid)
  ORDER BY
    CASE WHEN t.priority = 1 THEN 0 WHEN t.priority = 2 THEN 1 ELSE 2 END,
    t.due_at NULLS LAST,
    t.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_assign_task(
  _task_id uuid,
  _assignee_id uuid
)
RETURNS public.ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid) OR NOT public.housekeeping_is_supervisor(_uid)
    THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  IF NOT public.has_any_role(_assignee_id, ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Assignee must have housekeeping role'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _assignee_id,
      claimed_at = NULL,
      started_at = NULL,
      status = CASE WHEN status = 'in_progress' THEN 'pending'::public.ops_task_status ELSE status END,
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_claim_task(_task_id uuid)
RETURNS public.ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Task is closed'; END IF;
  IF _task.assignee_id IS NOT NULL AND _task.assignee_id <> _uid THEN
    RAISE EXCEPTION 'Task is assigned to another housekeeper';
  END IF;

  UPDATE public.ops_tasks
  SET assignee_id = _uid,
      claimed_at = COALESCE(claimed_at, now()),
      status = 'pending',
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_start_task(_task_id uuid)
RETURNS public.ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status <> 'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _task.room_state_id FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE id = _task_id
  RETURNING * INTO _task;
  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(
  _task_id uuid,
  _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Task is assigned to another housekeeper'; END IF;
  IF _task.status = 'completed' THEN RETURN _task; END IF;
  IF _task.status <> 'in_progress' THEN RAISE EXCEPTION 'Start the task before completing it'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.housekeeping_transition_log
    WHERE idempotency_key = _idempotency_key
  ) THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id;
    RETURN _task;
  END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _task.room_state_id FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  UPDATE public.room_states
  SET state = 'inspection',
      state_note = NULLIF(trim(COALESCE(_note,'')), ''),
      updated_by = _uid,
      updated_at = now()
  WHERE id = _rs.id;

  INSERT INTO public.housekeeping_transition_log
    (room_state_id, from_state, to_state, actor_id, idempotency_key, note)
  VALUES
    (_rs.id, _rs.state, 'inspection', _uid, _idempotency_key, _note);

  UPDATE public.ops_tasks
  SET status = 'completed',
      completed_at = now(),
      completed_by = _uid,
      updated_at = now(),
      description = CASE
        WHEN NULLIF(trim(COALESCE(_note,'')), '') IS NULL THEN description
        ELSE concat_ws(E'\n', NULLIF(description,''), 'Cleaning note: ' || trim(_note))
      END
  WHERE id = _task_id
  RETURNING * INTO _task;

  RETURN _task;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_list_work(boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_assign_task(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_claim_task(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_start_task(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_complete_task(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_work(boolean,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_assign_task(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_claim_task(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_start_task(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_complete_task(uuid,text,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.housekeeping_complete_task(uuid,text,text)
IS 'Atomic housekeeping completion: validates assigned work, marks task complete, and advances room to inspection with idempotent transition logging.';
