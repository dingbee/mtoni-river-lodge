-- SN-IQ-05 workstream 2: dispatch guest requests into operational task queues.
-- Dispatch is idempotent: one guest request can create at most one ops task.

ALTER TABLE public.staynas_guest_requests
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operational_task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staynas_guest_requests_operational_task_uidx
  ON public.staynas_guest_requests(operational_task_id)
  WHERE operational_task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.staynas_dispatch_guest_request(
  _request_id uuid,
  _assignee_id uuid DEFAULT NULL,
  _due_at timestamptz DEFAULT NULL
)
RETURNS TABLE(request_id uuid, task_id uuid, task_category text, task_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _request public.staynas_guest_requests%ROWTYPE;
  _task_id uuid;
  _task_category text;
  _task_type text;
  _title text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Active property access denied';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception']::public.app_role[]) THEN
    RAISE EXCEPTION 'Supervisor or reception access required to dispatch guest requests';
  END IF;

  SELECT * INTO _request
  FROM public.staynas_guest_requests
  WHERE id = _request_id AND property_id = _property_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest request not found in active property'; END IF;
  IF _request.status IN ('cancelled','fulfilled') THEN RAISE EXCEPTION 'Closed guest request cannot be dispatched'; END IF;

  IF _request.operational_task_id IS NOT NULL THEN
    RETURN QUERY
      SELECT _request.id, t.id, t.category, t.status::text
      FROM public.ops_tasks t WHERE t.id = _request.operational_task_id;
    RETURN;
  END IF;

  IF _assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.property_id = _property_id
      AND pm.user_id = _assignee_id
      AND pm.status = 'active'
      AND pm.role IN ('owner','manager','admin','reception','housekeeping')
  ) THEN
    RAISE EXCEPTION 'Assignee is not an active member of this property';
  END IF;

  _task_category := CASE _request.category
    WHEN 'housekeeping' THEN 'housekeeping'
    WHEN 'room_service' THEN 'fnb'
    WHEN 'dining' THEN 'fnb'
    WHEN 'private_dining' THEN 'fnb'
    WHEN 'airport_transfer' THEN 'transport'
    WHEN 'maintenance' THEN 'maintenance'
    ELSE 'concierge'
  END;
  _task_type := 'guest_request_' || _request.category;
  _title := CASE _request.category
    WHEN 'housekeeping' THEN 'Guest housekeeping request'
    WHEN 'room_service' THEN 'Guest room service request'
    WHEN 'dining' THEN 'Guest dining request'
    WHEN 'private_dining' THEN 'Private dining arrangement'
    WHEN 'airport_transfer' THEN 'Guest airport transfer'
    WHEN 'maintenance' THEN 'Guest maintenance request'
    WHEN 'special_occasion' THEN 'Guest special occasion'
    WHEN 'complaint' THEN 'Guest complaint'
    WHEN 'service_recovery' THEN 'Guest service recovery'
    ELSE 'Guest concierge request'
  END;

  INSERT INTO public.ops_tasks (
    booking_id, task_type, category, title, description, priority, status,
    due_at, assignee_id
  ) VALUES (
    _request.booking_id, _task_type, _task_category, _title,
    _request.request_text, _request.priority, 'pending',
    _due_at, _assignee_id
  ) RETURNING id INTO _task_id;

  UPDATE public.staynas_guest_requests
  SET operational_task_id = _task_id,
      dispatched_at = now(),
      dispatched_by = _uid,
      status = 'assigned',
      updated_at = now()
  WHERE id = _request.id;

  RETURN QUERY SELECT _request.id, _task_id, _task_category, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_dispatch_guest_request(uuid,uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_dispatch_guest_request(uuid,uuid,timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.staynas_dispatch_guest_request(uuid,uuid,timestamptz)
IS 'Idempotently dispatches one active-property guest request into the matching operational task category.';
