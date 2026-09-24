-- HK-S3: Housekeeping inspection and controlled room readiness
-- Cleaning completion creates an auditable inspection. Supervisors alone can pass/fail it.

CREATE TABLE IF NOT EXISTS public.housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_state_id uuid NOT NULL REFERENCES public.room_states(id) ON DELETE CASCADE,
  cleaning_task_id uuid NOT NULL REFERENCES public.ops_tasks(id) ON DELETE RESTRICT,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed')),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  inspector_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inspected_at timestamptz,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS housekeeping_inspections_pending_room_idx
  ON public.housekeeping_inspections(room_state_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS housekeeping_inspections_status_idx
  ON public.housekeeping_inspections(status, created_at DESC);
CREATE INDEX IF NOT EXISTS housekeeping_inspections_room_idx
  ON public.housekeeping_inspections(room_state_id, attempt_no DESC);

ALTER TABLE public.housekeeping_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read housekeeping inspections" ON public.housekeeping_inspections;
CREATE POLICY "Staff read housekeeping inspections"
  ON public.housekeeping_inspections FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.housekeeping_inspections FROM authenticated, anon;
GRANT SELECT ON public.housekeeping_inspections TO authenticated;
GRANT ALL ON public.housekeeping_inspections TO service_role;

DROP TRIGGER IF EXISTS housekeeping_inspections_updated_at ON public.housekeeping_inspections;
CREATE TRIGGER housekeeping_inspections_updated_at
BEFORE UPDATE ON public.housekeeping_inspections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.housekeeping_checklist_template()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('key','bedroom','label','Bedroom clean and reset'),
    jsonb_build_object('key','bathroom','label','Bathroom clean and stocked'),
    jsonb_build_object('key','linen','label','Linen and towels complete'),
    jsonb_build_object('key','amenities','label','Amenities replenished'),
    jsonb_build_object('key','floor','label','Floor and surfaces clean'),
    jsonb_build_object('key','fixtures','label','Fixtures and equipment checked'),
    jsonb_build_object('key','waste','label','Waste removed'),
    jsonb_build_object('key','overall','label','Overall room presentation ready')
  )
$$;

-- Ensure S2 completions also create inspection records.
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

  IF EXISTS (SELECT 1 FROM public.housekeeping_transition_log WHERE idempotency_key = _idempotency_key) THEN
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
        ELSE concat_ws(E'\\n', NULLIF(description,''), 'Cleaning note: ' || trim(_note))
      END
  WHERE id = _task_id
  RETURNING * INTO _task;

  INSERT INTO public.housekeeping_inspections (
    room_state_id, cleaning_task_id, attempt_no, status, checklist
  ) VALUES (
    _rs.id, _task.id, 1, 'pending', public.housekeeping_checklist_template()
  )
  ON CONFLICT (room_state_id) WHERE status = 'pending' DO NOTHING;

  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_inspection_queue()
RETURNS TABLE (
  inspection_id uuid,
  room_state_id uuid,
  cleaning_task_id uuid,
  attempt_no integer,
  status text,
  unit_label text,
  room_name text,
  room_id uuid,
  booking_id uuid,
  booking_reference text,
  guest_name text,
  completed_at timestamptz,
  checklist jsonb,
  notes text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'Supervisor access required'; END IF;

  RETURN QUERY
  SELECT i.id, i.room_state_id, i.cleaning_task_id, i.attempt_no, i.status,
         rs.unit_label, r.name, r.id, t.booking_id, b.reference, b.guest_name,
         t.completed_at, i.checklist, i.notes
  FROM public.housekeeping_inspections i
  JOIN public.room_states rs ON rs.id = i.room_state_id
  JOIN public.rooms r ON r.id = rs.room_id
  JOIN public.ops_tasks t ON t.id = i.cleaning_task_id
  LEFT JOIN public.bookings b ON b.id = t.booking_id
  WHERE i.status = 'pending'
  ORDER BY t.completed_at NULLS LAST, i.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_submit_inspection(
  _inspection_id uuid,
  _checklist jsonb,
  _passed boolean,
  _notes text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.housekeeping_inspections
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inspection public.housekeeping_inspections%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _task public.ops_tasks%ROWTYPE;
  _required text[] := ARRAY['bedroom','bathroom','linen','amenities','floor','fixtures','waste','overall'];
  _key text;
  _snapshot jsonb := '[]'::jsonb;
  _all_passed boolean := true;
  _item jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF jsonb_typeof(_checklist) <> 'array' OR jsonb_array_length(_checklist) <> 8
    THEN RAISE EXCEPTION 'Complete inspection checklist is required'; END IF;

  SELECT * INTO _inspection FROM public.housekeeping_inspections
  WHERE id = _inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF _inspection.status <> 'pending' THEN RETURN _inspection; END IF;

  IF EXISTS (SELECT 1 FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key) THEN
    SELECT * INTO _inspection FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key;
    RETURN _inspection;
  END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id = _inspection.room_state_id FOR UPDATE;
  SELECT * INTO _task FROM public.ops_tasks WHERE id = _inspection.cleaning_task_id FOR UPDATE;
  IF NOT FOUND OR _rs.state <> 'inspection' THEN RAISE EXCEPTION 'Room is not awaiting inspection'; END IF;
  IF _task.status <> 'completed' THEN RAISE EXCEPTION 'Cleaning task is not complete'; END IF;

  FOREACH _key IN ARRAY _required LOOP
    SELECT x INTO _item
    FROM jsonb_array_elements(_checklist) x
    WHERE x->>'key' = _key;
    IF _item IS NULL OR (_item ? 'passed') = false OR jsonb_typeof(_item->'passed') <> 'boolean'
      THEN RAISE EXCEPTION 'Invalid inspection checklist'; END IF;
    _snapshot := _snapshot || jsonb_build_array(
      jsonb_build_object(
        'key', _key,
        'label', (SELECT value->>'label' FROM jsonb_array_elements(public.housekeeping_checklist_template()) value WHERE value->>'key' = _key),
        'passed', (_item->>'passed')::boolean
      )
    );
    IF (_item->>'passed')::boolean = false THEN _all_passed := false; END IF;
  END LOOP;

  IF _passed AND NOT _all_passed THEN RAISE EXCEPTION 'All checklist items must pass before room can be ready'; END IF;
  IF NOT _passed THEN _all_passed := false; END IF;

  IF _passed THEN
    PERFORM public.housekeeping_transition_room_state(
      _rs.id, 'vacant_clean',
      NULLIF(trim(COALESCE(_notes,'')), ''),
      'inspection:' || _idempotency_key
    );

    UPDATE public.housekeeping_inspections
    SET status = 'passed', checklist = _snapshot, notes = NULLIF(trim(COALESCE(_notes,'')), ''),
        inspector_id = _uid, inspected_at = now(), idempotency_key = _idempotency_key, updated_at = now()
    WHERE id = _inspection.id
    RETURNING * INTO _inspection;
  ELSE
    PERFORM public.housekeeping_transition_room_state(
      _rs.id, 'vacant_dirty',
      NULLIF(trim(COALESCE(_notes,'')), ''),
      'inspection:' || _idempotency_key
    );

    UPDATE public.housekeeping_inspections
    SET status = 'failed', checklist = _snapshot, notes = NULLIF(trim(COALESCE(_notes,'')), ''),
        inspector_id = _uid, inspected_at = now(), idempotency_key = _idempotency_key, updated_at = now()
    WHERE id = _inspection.id
    RETURNING * INTO _inspection;

    INSERT INTO public.ops_tasks (
      booking_id, task_type, category, title, description, priority, due_at, room_state_id
    )
    VALUES (
      _task.booking_id, 'housekeeping_reclean', 'housekeeping',
      'Re-clean ' || _rs.unit_label,
      concat_ws(E'\\n', 'Inspection failed — re-clean required', NULLIF(trim(COALESCE(_notes,'')), '')),
      1, now() + interval '1 hour', _rs.id
    );
  END IF;

  RETURN _inspection;
END;
$$;

-- Backfill inspection records for S2 completions that predate S3.
INSERT INTO public.housekeeping_inspections (room_state_id, cleaning_task_id, attempt_no, status, checklist)
SELECT rs.id, t.id, 1, 'pending', public.housekeeping_checklist_template()
FROM public.room_states rs
JOIN public.ops_tasks t ON t.room_state_id = rs.id
WHERE rs.state = 'inspection'
  AND t.category = 'housekeeping'
  AND t.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.housekeeping_inspections i
    WHERE i.room_state_id = rs.id AND i.status = 'pending'
  )
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.housekeeping_list_inspection_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_inspection_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text) TO authenticated, service_role;

COMMENT ON TABLE public.housekeeping_inspections IS 'Auditable supervisor inspection attempts between cleaning completion and operational room readiness.';
