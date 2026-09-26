-- HK-S6: resilience, authorization and certification hardening
-- The Housekeeping domain remains single-property until the canonical Property
-- architecture is completed in the next platform phase.

-- ---------------------------------------------------------------------------
-- 1. Idempotent execution for claim/start actions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.housekeeping_action_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL CHECK (action_type IN ('claim','start')),
  idempotency_key text NOT NULL,
  task_id uuid NOT NULL REFERENCES public.ops_tasks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(action_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS housekeeping_action_idempotency_task_idx
  ON public.housekeeping_action_idempotency(task_id, created_at DESC);

ALTER TABLE public.housekeeping_action_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Housekeeping staff read action idempotency" ON public.housekeeping_action_idempotency;
CREATE POLICY "Housekeeping staff read action idempotency"
  ON public.housekeeping_action_idempotency
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
  );

REVOKE INSERT, UPDATE, DELETE ON public.housekeeping_action_idempotency FROM anon, authenticated;
GRANT SELECT ON public.housekeeping_action_idempotency TO authenticated;
GRANT ALL ON public.housekeeping_action_idempotency TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Prevent direct authenticated writes to housekeeping tasks.
-- Generic operations may still manage non-housekeeping tasks. Housekeeping
-- execution is exclusively through the governed RPCs.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff manage ops_tasks" ON public.ops_tasks;

CREATE POLICY "Staff read ops_tasks"
  ON public.ops_tasks
  FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "Staff manage non-housekeeping ops_tasks"
  ON public.ops_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_any_staff(auth.uid())
    AND COALESCE(category, '') <> 'housekeeping'
  );

CREATE POLICY "Staff update non-housekeeping ops_tasks"
  ON public.ops_tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND COALESCE(category, '') <> 'housekeeping'
  )
  WITH CHECK (
    public.is_any_staff(auth.uid())
    AND COALESCE(category, '') <> 'housekeeping'
  );

CREATE POLICY "Staff delete non-housekeeping ops_tasks"
  ON public.ops_tasks
  FOR DELETE TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND COALESCE(category, '') <> 'housekeeping'
  );

-- ---------------------------------------------------------------------------
-- 3. Prevent housekeeping attendants from bypassing the room-readiness domain.
-- Supervisor/reception operations retain their existing room-board capability;
-- housekeeping attendants must use the governed Housekeeping workflow.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff manage room_states" ON public.room_states;

CREATE POLICY "Staff read room_states"
  ON public.room_states
  FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "Supervisors insert room_states"
  ON public.room_states
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

CREATE POLICY "Supervisors update room_states"
  ON public.room_states
  FOR UPDATE TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND NOT public.has_any_role(auth.uid(), ARRAY['housekeeping']::public.app_role[])
  )
  WITH CHECK (
    public.is_any_staff(auth.uid())
    AND NOT public.has_any_role(auth.uid(), ARRAY['housekeeping']::public.app_role[])
  );

CREATE POLICY "Supervisors delete room_states"
  ON public.room_states
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

-- ---------------------------------------------------------------------------
-- 4. Claim/start RPCs become retry-safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.housekeeping_claim_task(
  _task_id uuid,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing
  FROM public.housekeeping_action_idempotency
  WHERE action_type = 'claim'
    AND idempotency_key = _idempotency_key
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _existing.task_id;
    RETURN _task;
  END IF;

  IF _task.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Task is closed';
  END IF;
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

  INSERT INTO public.housekeeping_action_idempotency(
    action_type, idempotency_key, task_id, actor_id, result
  )
  VALUES ('claim', _idempotency_key, _task.id, _uid, to_jsonb(_task))
  ON CONFLICT (action_type, idempotency_key) DO NOTHING;

  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_start_task(
  _task_id uuid,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping staff access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing
  FROM public.housekeeping_action_idempotency
  WHERE action_type = 'start'
    AND idempotency_key = _idempotency_key
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _existing.task_id;
    RETURN _task;
  END IF;

  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status = 'in_progress' THEN
    INSERT INTO public.housekeeping_action_idempotency(
      action_type, idempotency_key, task_id, actor_id, result
    )
    VALUES ('start', _idempotency_key, _task.id, _uid, to_jsonb(_task))
    ON CONFLICT (action_type, idempotency_key) DO NOTHING;
    RETURN _task;
  END IF;
  IF _task.status <> 'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs
  FROM public.room_states
  WHERE id = _task.room_state_id
  FOR UPDATE;

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

  INSERT INTO public.housekeeping_action_idempotency(
    action_type, idempotency_key, task_id, actor_id, result
  )
  VALUES ('start', _idempotency_key, _task.id, _uid, to_jsonb(_task))
  ON CONFLICT (action_type, idempotency_key) DO NOTHING;

  RETURN _task;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_claim_task(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.housekeeping_start_task(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.housekeeping_claim_task(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_start_task(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_claim_task(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_start_task(uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Enforce canonical transition usage for housekeeping completion.
-- Replace the earlier direct room update with the S1 transition function.
-- ---------------------------------------------------------------------------
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

  SELECT * INTO _task
  FROM public.ops_tasks
  WHERE id = _task_id AND category = 'housekeeping'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id <> _uid THEN RAISE EXCEPTION 'Task is assigned to another housekeeper'; END IF;
  IF _task.status = 'completed' THEN RETURN _task; END IF;
  IF _task.status <> 'in_progress' THEN RAISE EXCEPTION 'Start the task before completing it'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.housekeeping_transition_log
    WHERE idempotency_key = _idempotency_key
  ) THEN
    RETURN _task;
  END IF;

  SELECT * INTO _rs
  FROM public.room_states
  WHERE id = _task.room_state_id
  FOR UPDATE;

  IF NOT FOUND OR _rs.state <> 'vacant_dirty' THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  PERFORM public.housekeeping_transition_room_state(
    _rs.id,
    'inspection',
    _note,
    _idempotency_key
  );

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

  INSERT INTO public.housekeeping_inspections (
    room_state_id, cleaning_task_id, status, checklist
  )
  VALUES (
    _rs.id, _task.id, 'pending', public.housekeeping_checklist_template()
  )
  ON CONFLICT (room_state_id) WHERE status = 'pending' DO NOTHING;

  RETURN _task;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_complete_task(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_complete_task(uuid,text,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Explicit certification marker for the current single-property scope.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.housekeeping_action_idempotency IS
'Housekeeping retry/idempotency ledger. HK-S6 certified for concurrency-safe claim/start retries. Property isolation is deferred to the canonical StayNas Property architecture phase.';
