-- SN-IQ-05G: allow in-stay guest housekeeping work to use HK-X without
-- incorrectly converting an occupied room into sellable vacant inventory.
-- Only tasks linked to an active SN-IQ-05 housekeeping request receive this path.

CREATE OR REPLACE FUNCTION public.housekeeping_transition_room_state(
  _room_state_id uuid,
  _to_state public.room_state,
  _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.room_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current public.room_states%ROWTYPE;
  _existing public.housekeeping_transition_log%ROWTYPE;
  _result public.room_states%ROWTYPE;
  _is_supervisor boolean;
  _has_active_guest_hk_request boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_any_staff(_uid) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  SELECT * INTO _existing FROM public.housekeeping_transition_log
  WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    SELECT * INTO _result FROM public.room_states WHERE id = _existing.room_state_id;
    RETURN _result;
  END IF;

  SELECT * INTO _current FROM public.room_states WHERE id = _room_state_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room state not found'; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.ops_tasks t
    JOIN public.staynas_guest_requests gr
      ON gr.operational_task_id = t.id
     AND gr.property_id = t.property_id
     AND gr.room_state_id = t.room_state_id
    WHERE t.room_state_id = _room_state_id
      AND t.category = 'housekeeping'
      AND t.task_type IN ('guest_request_housekeeping','housekeeping_reclean')
      AND gr.category = 'housekeeping'
      AND gr.status NOT IN ('fulfilled','cancelled')
  ) INTO _has_active_guest_hk_request;

  _is_supervisor := public.has_any_role(
    _uid, ARRAY['admin'::public.app_role,'owner'::public.app_role,'manager'::public.app_role]
  );

  IF NOT _is_supervisor AND NOT public.has_any_role(_uid, ARRAY['housekeeping'::public.app_role]) THEN
    RAISE EXCEPTION 'Housekeeping transition requires housekeeping or supervisor role';
  END IF;

  IF NOT _is_supervisor THEN
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state = 'inspection')
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean','vacant_dirty'))
      OR (_has_active_guest_hk_request AND _current.state = 'occupied' AND _to_state = 'inspection')
      OR (_has_active_guest_hk_request AND _current.state = 'inspection' AND _to_state = 'occupied')
    ) THEN
      RAISE EXCEPTION 'Invalid housekeeping transition: % -> %',_current.state,_to_state;
    END IF;
  ELSE
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state IN ('inspection','maintenance','out_of_service'))
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean','vacant_dirty','maintenance','out_of_service'))
      OR (_current.state = 'vacant_clean' AND _to_state IN ('vacant_dirty','maintenance','out_of_service'))
      OR (_current.state = 'maintenance' AND _to_state IN ('vacant_dirty','vacant_clean','out_of_service'))
      OR (_current.state = 'out_of_service' AND _to_state IN ('maintenance','vacant_dirty','vacant_clean'))
      OR (_has_active_guest_hk_request AND _current.state = 'occupied' AND _to_state = 'inspection')
      OR (_has_active_guest_hk_request AND _current.state = 'inspection' AND _to_state = 'occupied')
    ) THEN
      RAISE EXCEPTION 'Invalid room-readiness transition: % -> %',_current.state,_to_state;
    END IF;
  END IF;

  UPDATE public.room_states
  SET state=_to_state,state_note=NULLIF(trim(COALESCE(_note,'')),''),updated_by=_uid,updated_at=now()
  WHERE id=_room_state_id
  RETURNING * INTO _result;

  INSERT INTO public.housekeeping_transition_log(room_state_id,from_state,to_state,actor_id,idempotency_key,note)
  VALUES(_room_state_id,_current.state,_to_state,_uid,_idempotency_key,_note);
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_start_task(_task_id uuid,_idempotency_key text DEFAULT NULL)
RETURNS public.ops_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _existing public.housekeeping_action_idempotency%ROWTYPE;
  _guest_request boolean := false;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid,ARRAY['housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Housekeeping staff access required';
  END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  SELECT * INTO _task FROM public.ops_tasks
  WHERE id=_task_id AND category='housekeeping' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;

  SELECT * INTO _existing FROM public.housekeeping_action_idempotency
  WHERE action_type='start' AND idempotency_key=_idempotency_key LIMIT 1;
  IF FOUND THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id=_existing.task_id;
    RETURN _task;
  END IF;

  IF _task.assignee_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Claim the task before starting'; END IF;
  IF _task.status='in_progress' THEN
    INSERT INTO public.housekeeping_action_idempotency(action_type,idempotency_key,task_id,actor_id,result)
    VALUES('start',_idempotency_key,_task.id,_uid,to_jsonb(_task))
    ON CONFLICT(action_type,idempotency_key) DO NOTHING;
    RETURN _task;
  END IF;
  IF _task.status<>'pending' THEN RAISE EXCEPTION 'Task is not pending'; END IF;
  IF _task.room_state_id IS NULL THEN RAISE EXCEPTION 'Housekeeping task has no room'; END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id=_task.room_state_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room state not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staynas_guest_requests gr
    WHERE gr.operational_task_id=_task.id
      AND gr.property_id=_task.property_id
      AND gr.room_state_id=_task.room_state_id
      AND gr.category='housekeeping'
      AND gr.status NOT IN ('fulfilled','cancelled')
  ) INTO _guest_request;

  IF NOT (_rs.state='vacant_dirty' OR (_guest_request AND _rs.state='occupied')) THEN
    RAISE EXCEPTION 'Room is not awaiting housekeeping execution';
  END IF;

  UPDATE public.ops_tasks
  SET status='in_progress',started_at=COALESCE(started_at,now()),claimed_at=COALESCE(claimed_at,now()),updated_at=now()
  WHERE id=_task_id RETURNING * INTO _task;

  INSERT INTO public.housekeeping_action_idempotency(action_type,idempotency_key,task_id,actor_id,result)
  VALUES('start',_idempotency_key,_task.id,_uid,to_jsonb(_task))
  ON CONFLICT(action_type,idempotency_key) DO NOTHING;
  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(
  _task_id uuid,_note text DEFAULT NULL,_idempotency_key text DEFAULT NULL
)
RETURNS public.ops_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.ops_tasks%ROWTYPE;
  _rs public.room_states%ROWTYPE;
  _guest_request boolean := false;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid,ARRAY['housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Housekeeping staff access required';
  END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key))<8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  SELECT * INTO _task FROM public.ops_tasks
  WHERE id=_task_id AND category='housekeeping' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  IF _task.assignee_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Task is assigned to another housekeeper'; END IF;
  IF _task.status='completed' THEN RETURN _task; END IF;
  IF _task.status<>'in_progress' THEN RAISE EXCEPTION 'Start the task before completing it'; END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id=_task.room_state_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room state not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staynas_guest_requests gr
    WHERE gr.operational_task_id=_task.id
      AND gr.property_id=_task.property_id
      AND gr.room_state_id=_task.room_state_id
      AND gr.category='housekeeping'
      AND gr.status NOT IN ('fulfilled','cancelled')
  ) INTO _guest_request;

  IF NOT (_rs.state='vacant_dirty' OR (_guest_request AND _rs.state='occupied')) THEN
    RAISE EXCEPTION 'Room is not awaiting cleaning';
  END IF;

  IF EXISTS (SELECT 1 FROM public.housekeeping_transition_log WHERE idempotency_key=_idempotency_key) THEN
    RETURN _task;
  END IF;

  PERFORM public.housekeeping_transition_room_state(_rs.id,'inspection',_note,_idempotency_key);

  UPDATE public.ops_tasks
  SET status='completed',completed_at=now(),completed_by=_uid,updated_at=now(),
      description=CASE WHEN NULLIF(trim(COALESCE(_note,'')),'') IS NULL THEN description
        ELSE concat_ws(E'\n',NULLIF(description,''),'Cleaning note: '||trim(_note)) END
  WHERE id=_task_id RETURNING * INTO _task;

  INSERT INTO public.housekeeping_inspections(room_state_id,cleaning_task_id,status,checklist)
  VALUES(_rs.id,_task.id,'pending',public.housekeeping_checklist_template())
  ON CONFLICT(room_state_id) WHERE status='pending' DO NOTHING;

  RETURN _task;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_submit_inspection(
  _inspection_id uuid,_checklist jsonb,_passed boolean,_notes text DEFAULT NULL,_idempotency_key text DEFAULT NULL
)
RETURNS public.housekeeping_inspections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  _guest_request boolean := false;
  _target_state public.room_state;
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(_uid,ARRAY['owner','manager','admin']::public.app_role[])
  THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key))<8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;
  IF jsonb_typeof(_checklist)<>'array' OR jsonb_array_length(_checklist)<>8 THEN
    RAISE EXCEPTION 'Complete inspection checklist is required';
  END IF;

  SELECT * INTO _inspection FROM public.housekeeping_inspections WHERE id=_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF _inspection.status<>'pending' THEN RETURN _inspection; END IF;
  IF EXISTS (SELECT 1 FROM public.housekeeping_inspections WHERE idempotency_key=_idempotency_key) THEN
    SELECT * INTO _inspection FROM public.housekeeping_inspections WHERE idempotency_key=_idempotency_key;
    RETURN _inspection;
  END IF;

  SELECT * INTO _rs FROM public.room_states WHERE id=_inspection.room_state_id FOR UPDATE;
  SELECT * INTO _task FROM public.ops_tasks WHERE id=_inspection.cleaning_task_id FOR UPDATE;
  IF NOT FOUND OR _rs.state<>'inspection' THEN RAISE EXCEPTION 'Room is not awaiting inspection'; END IF;
  IF _task.status<>'completed' THEN RAISE EXCEPTION 'Cleaning task is not complete'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staynas_guest_requests gr
    WHERE gr.operational_task_id=_task.id
      AND gr.property_id=_task.property_id
      AND gr.room_state_id=_rs.id
      AND gr.category='housekeeping'
      AND gr.status NOT IN ('fulfilled','cancelled')
  ) INTO _guest_request;

  FOREACH _key IN ARRAY _required LOOP
    _item:=NULL;
    SELECT x INTO _item FROM jsonb_array_elements(_checklist) x WHERE x->>'key'=_key;
    IF _item IS NULL OR (_item ? 'passed')=false OR jsonb_typeof(_item->'passed')<>'boolean' THEN
      RAISE EXCEPTION 'Invalid inspection checklist';
    END IF;
    _snapshot:=_snapshot||jsonb_build_array(jsonb_build_object(
      'key',_key,
      'label',(SELECT value->>'label' FROM jsonb_array_elements(public.housekeeping_checklist_template()) value WHERE value->>'key'=_key),
      'passed',(_item->>'passed')::boolean
    ));
    IF (_item->>'passed')::boolean=false THEN _all_passed:=false; END IF;
  END LOOP;

  IF _passed AND NOT _all_passed THEN RAISE EXCEPTION 'All checklist items must pass before room can be ready'; END IF;
  IF NOT _passed THEN _all_passed:=false; END IF;

  IF _guest_request THEN
    _target_state:='occupied';
  ELSIF _passed THEN
    _target_state:='vacant_clean';
  ELSE
    _target_state:='vacant_dirty';
  END IF;

  PERFORM public.housekeeping_transition_room_state(
    _rs.id,_target_state,NULLIF(trim(COALESCE(_notes,'')),''),'inspection:'||_idempotency_key
  );

  UPDATE public.housekeeping_inspections
  SET status=CASE WHEN _passed THEN 'passed' ELSE 'failed' END,
      checklist=_snapshot,notes=NULLIF(trim(COALESCE(_notes,'')),''),
      inspector_id=_uid,inspected_at=now(),idempotency_key=_idempotency_key,updated_at=now()
  WHERE id=_inspection.id RETURNING * INTO _inspection;

  IF NOT _passed THEN
    INSERT INTO public.ops_tasks(
      property_id,booking_id,task_type,category,title,description,priority,due_at,room_state_id
    )
    VALUES(
      _rs.property_id,_task.booking_id,'housekeeping_reclean','housekeeping',
      'Re-clean '||_rs.unit_label,
      concat_ws(E'\n','Inspection failed — re-clean required',NULLIF(trim(COALESCE(_notes,'')),'')),
      1,now()+interval '1 hour',_rs.id
    );
  END IF;

  RETURN _inspection;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_sync_housekeeping_guest_request_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room_state public.room_states%ROWTYPE;
  _task public.ops_tasks%ROWTYPE;
  _is_guest_request boolean := false;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('passed','failed') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _room_state FROM public.room_states WHERE id=NEW.room_state_id FOR UPDATE;
  SELECT * INTO _task FROM public.ops_tasks WHERE id=NEW.cleaning_task_id;
  IF NOT FOUND OR _task.category<>'housekeeping' THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staynas_guest_requests gr
    WHERE gr.operational_task_id=_task.id
      AND gr.property_id=_task.property_id
      AND gr.room_state_id=NEW.room_state_id
      AND gr.category='housekeeping'
      AND gr.status NOT IN ('fulfilled','cancelled')
  ) INTO _is_guest_request;

  IF NEW.status='passed'
     AND (_room_state.state='vacant_clean' OR (_is_guest_request AND _room_state.state='occupied')) THEN
    UPDATE public.staynas_guest_requests
    SET status='fulfilled',
        status_note='Housekeeping is complete and the room passed its final inspection.',
        status_updated_by=NEW.inspector_id,
        updated_at=now()
    WHERE operational_task_id=NEW.cleaning_task_id
      AND room_state_id=NEW.room_state_id
      AND property_id=_room_state.property_id
      AND category='housekeeping'
      AND status NOT IN ('fulfilled','cancelled');
  ELSIF NEW.status='failed' THEN
    UPDATE public.staynas_guest_requests
    SET status_note='The room did not pass inspection. Housekeeping is following up.',
        status_updated_by=NEW.inspector_id,
        updated_at=now()
    WHERE operational_task_id=NEW.cleaning_task_id
      AND room_state_id=NEW.room_state_id
      AND property_id=_room_state.property_id
      AND category='housekeeping'
      AND status NOT IN ('fulfilled','cancelled');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_transition_room_state(uuid,public.room_state,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_transition_room_state(uuid,public.room_state,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.housekeeping_start_task(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_start_task(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.housekeeping_complete_task(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_complete_task(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.staynas_sync_housekeeping_guest_request_inspection() FROM PUBLIC,anon,authenticated;
