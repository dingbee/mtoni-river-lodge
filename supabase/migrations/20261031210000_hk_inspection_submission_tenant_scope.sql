-- HK inspection submission: enforce active-property scope through the full pass/fail path.
-- Preserves the existing checklist, idempotency, room-state transitions and re-clean behavior.

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
  _property_id uuid;
  _inspection public.housekeeping_inspections%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _room public.rooms%ROWTYPE;
  _task public.ops_tasks%ROWTYPE;
  _booking_property_id uuid;
  _required text[] := ARRAY['bedroom','bathroom','linen','amenities','floor','fixtures','waste','overall'];
  _key text;
  _snapshot jsonb := '[]'::jsonb;
  _all_passed boolean := true;
  _item jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'Supervisor access required'; END IF;

  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Active property access required';
  END IF;

  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF jsonb_typeof(_checklist) <> 'array' OR jsonb_array_length(_checklist) <> 8
    THEN RAISE EXCEPTION 'Complete inspection checklist is required'; END IF;

  SELECT * INTO _inspection FROM public.housekeeping_inspections
  WHERE id = _inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;

  SELECT * INTO _rs FROM public.room_states
  WHERE id = _inspection.room_state_id FOR UPDATE;
  IF NOT FOUND OR _rs.property_id IS DISTINCT FROM _property_id THEN
    RAISE EXCEPTION 'Inspection is outside the active property';
  END IF;

  SELECT * INTO _room FROM public.rooms WHERE id = _rs.room_id;
  IF NOT FOUND OR _room.property_id IS DISTINCT FROM _property_id THEN
    RAISE EXCEPTION 'Inspection room is outside the active property';
  END IF;

  SELECT * INTO _task FROM public.ops_tasks
  WHERE id = _inspection.cleaning_task_id FOR UPDATE;
  IF NOT FOUND OR _task.category <> 'housekeeping'
     OR _task.room_state_id IS DISTINCT FROM _rs.id THEN
    RAISE EXCEPTION 'Inspection cleaning task does not match its room';
  END IF;

  IF _task.booking_id IS NOT NULL THEN
    SELECT property_id INTO _booking_property_id
    FROM public.bookings WHERE id = _task.booking_id;
    IF NOT FOUND OR _booking_property_id IS DISTINCT FROM _property_id THEN
      RAISE EXCEPTION 'Inspection booking is outside the active property';
    END IF;
  END IF;

  IF _inspection.status <> 'pending' THEN RETURN _inspection; END IF;

  IF EXISTS (SELECT 1 FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key) THEN
    SELECT * INTO _inspection FROM public.housekeeping_inspections WHERE idempotency_key = _idempotency_key;
    IF _inspection.id IS DISTINCT FROM _inspection_id THEN
      RAISE EXCEPTION 'Idempotency key has already been used';
    END IF;
    RETURN _inspection;
  END IF;

  IF _rs.state <> 'inspection' THEN RAISE EXCEPTION 'Room is not awaiting inspection'; END IF;
  IF _task.status <> 'completed' THEN RAISE EXCEPTION 'Cleaning task is not complete'; END IF;

  FOREACH _key IN ARRAY _required LOOP
    _item := NULL;
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

REVOKE ALL ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text)
IS 'Supervisor inspection submission with active-property enforcement across inspection, room, cleaning task and linked booking.';
