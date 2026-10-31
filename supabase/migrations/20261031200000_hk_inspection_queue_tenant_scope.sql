-- HK tenant-scope closure task: inspection queue visibility.
-- Scope is derived from the canonical room_state property boundary; no ops_tasks
-- property_id dependency is required for this read path.

DROP POLICY IF EXISTS "Staff read housekeeping inspections" ON public.housekeeping_inspections;
CREATE POLICY "Property staff read housekeeping inspections"
  ON public.housekeeping_inspections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_states rs
      WHERE rs.id = housekeeping_inspections.room_state_id
        AND rs.property_id = public.staynas_active_property_id(auth.uid())
        AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
        AND public.is_any_staff(auth.uid())
    )
  );

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
BEGIN
  IF _uid IS NULL
     OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
  THEN
    RAISE EXCEPTION 'Supervisor access required';
  END IF;

  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid, _property_id)
  THEN
    RAISE EXCEPTION 'Active property access required';
  END IF;

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
    AND rs.property_id = _property_id
    AND r.property_id = _property_id
    AND (t.booking_id IS NULL OR b.property_id = _property_id)
  ORDER BY t.completed_at NULLS LAST, i.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_list_inspection_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_inspection_queue() TO authenticated, service_role;

COMMENT ON FUNCTION public.housekeeping_list_inspection_queue()
IS 'Lists pending housekeeping inspections only for the caller active property; requires supervisor staff access.';
