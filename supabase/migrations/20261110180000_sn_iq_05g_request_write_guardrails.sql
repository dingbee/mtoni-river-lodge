-- SN-IQ-05G authorization guardrails: request execution state can only be
-- advanced by the operational task/HK-X functions, never by direct table UPDATE
-- or the staff triage RPC.

REVOKE UPDATE ON TABLE public.staynas_guest_requests FROM authenticated;
DROP POLICY IF EXISTS "Property managers update guest requests" ON public.staynas_guest_requests;
DROP POLICY IF EXISTS "Property staff create guest requests" ON public.staynas_guest_requests;

CREATE POLICY "Property staff create guest requests"
  ON public.staynas_guest_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.is_any_staff(auth.uid())
    AND (
      booking_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND b.property_id = property_id
          AND (guest_id IS NULL OR b.guest_id IS NULL OR b.guest_id = guest_id)
      )
    )
    AND (
      session_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ai_concierge_sessions s
        WHERE s.id = session_id AND s.property_id = property_id
      )
    )
  );

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
