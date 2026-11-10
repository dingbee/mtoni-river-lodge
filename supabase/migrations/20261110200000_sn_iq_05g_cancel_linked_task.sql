-- SN-IQ-05G cancellation must stop linked work rather than only hiding the guest request.

CREATE OR REPLACE FUNCTION public.staynas_update_guest_request_status(
  _request_id uuid, _status text, _note text DEFAULT NULL
)
RETURNS TABLE(request_id uuid, request_status text, task_id uuid, task_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _request public.staynas_guest_requests%ROWTYPE;
  _task_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
    OR NOT public.is_any_staff(_uid)
    OR NOT public.has_any_role(_uid,ARRAY['owner','manager','admin','reception']::public.app_role[])
  THEN RAISE EXCEPTION 'Property supervisor or reception access required'; END IF;

  IF _status NOT IN ('received','triaged','assigned','in_progress','fulfilled','cancelled','escalated') THEN
    RAISE EXCEPTION 'Invalid guest request status';
  END IF;
  IF _status IN ('assigned','in_progress','fulfilled') THEN
    RAISE EXCEPTION 'Execution status is controlled by the linked operational task or HK-X inspection lifecycle';
  END IF;

  SELECT * INTO _request FROM public.staynas_guest_requests
  WHERE id=_request_id AND property_id=_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest request not found in active property'; END IF;

  IF _request.status IN ('fulfilled','cancelled') AND _status NOT IN (_request.status,'escalated') THEN
    RAISE EXCEPTION 'Closed guest request cannot be reopened through status update';
  END IF;

  IF _status='cancelled' AND _request.operational_task_id IS NOT NULL THEN
    UPDATE public.ops_tasks
    SET status='cancelled',updated_at=now()
    WHERE id=_request.operational_task_id
      AND property_id=_property_id
      AND status IN ('pending','in_progress');
  END IF;

  UPDATE public.staynas_guest_requests
  SET status=_status,
      status_note=NULLIF(_note,''),
      status_updated_by=_uid,
      updated_at=now()
  WHERE id=_request_id;

  IF _request.operational_task_id IS NOT NULL THEN
    SELECT status::text INTO _task_status FROM public.ops_tasks
    WHERE id=_request.operational_task_id AND property_id=_property_id;
  END IF;
  RETURN QUERY SELECT _request_id,_status,_request.operational_task_id,_task_status;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_update_guest_request_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staynas_update_guest_request_status(uuid,text,text) TO authenticated,service_role;
