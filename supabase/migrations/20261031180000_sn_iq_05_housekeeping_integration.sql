-- SN-IQ-05 / HK integration: route eligible guest housekeeping requests into the governed HK queue.
-- Idempotent dispatch is atomic with linking the request to the housekeeping task.

ALTER TABLE public.staynas_guest_requests
  ADD COLUMN IF NOT EXISTS operational_task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL;

ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_tasks_housekeeping_property_room_idx
  ON public.ops_tasks(property_id, room_state_id, status)
  WHERE category = 'housekeeping';

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
    RAISE EXCEPTION 'Only housekeeping requests can enter the housekeeping workflow';
  END IF;

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
    RAISE EXCEPTION 'Linked operational task is not a housekeeping task in this property';
  END IF;

  IF _request.booking_id IS NULL THEN
    RAISE EXCEPTION 'A booking-linked room is required before dispatching housekeeping';
  END IF;

  SELECT rs.id INTO _room_state_id
  FROM public.room_states rs
  JOIN public.bookings b ON b.id = rs.booking_id
  WHERE b.id = _request.booking_id
    AND b.property_id = _property_id
    AND rs.property_id = _property_id
  ORDER BY rs.updated_at DESC
  LIMIT 1
  FOR UPDATE OF rs;

  IF _room_state_id IS NULL THEN
    RAISE EXCEPTION 'No room state is linked to this booking; assign the room before dispatch';
  END IF;

  INSERT INTO public.ops_tasks (
    property_id, booking_id, room_state_id, task_type, category,
    title, description, priority, status, due_at
  ) VALUES (
    _property_id, _request.booking_id, _room_state_id, 'guest_request_housekeeping',
    'housekeeping', 'Guest request: housekeeping',
    _request.request_text, _request.priority, 'pending',
    COALESCE(_request.requested_for, now() + interval '30 minutes')
  )
  RETURNING id, status::text INTO _task_id, _task_status;

  UPDATE public.staynas_guest_requests
  SET operational_task_id = _task_id,
      status = 'assigned',
      status_updated_by = _uid,
      updated_at = now()
  WHERE id = _request.id;

  RETURN QUERY SELECT _request.id, _task_id, 'assigned'::text, _task_status;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_dispatch_housekeeping_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_dispatch_housekeeping_request(uuid) TO authenticated, service_role;
