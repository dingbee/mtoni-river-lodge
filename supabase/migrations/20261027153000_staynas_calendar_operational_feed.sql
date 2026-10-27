-- StayNas Phase 2: property-scoped operational calendar feed and staff schedules.
-- Additive migration. Not applied to production by this change.

CREATE TABLE IF NOT EXISTS public.staynas_staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_staff_schedules_valid_range CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS staynas_staff_schedules_property_start_idx
  ON public.staynas_staff_schedules(property_id, starts_at, ends_at)
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS staynas_staff_schedules_staff_start_idx
  ON public.staynas_staff_schedules(staff_user_id, starts_at)
  WHERE status <> 'cancelled';

ALTER TABLE public.staynas_staff_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_staff_schedules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_staff_schedules TO authenticated;
GRANT ALL ON public.staynas_staff_schedules TO service_role;

DROP POLICY IF EXISTS "Staff read accessible schedules" ON public.staynas_staff_schedules;
CREATE POLICY "Staff read accessible schedules"
  ON public.staynas_staff_schedules FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND (
      staff_user_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Managers manage accessible schedules" ON public.staynas_staff_schedules;
CREATE POLICY "Managers manage accessible schedules"
  ON public.staynas_staff_schedules FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    AND public.staynas_user_has_property_access(staff_user_id, property_id)
  );

DROP TRIGGER IF EXISTS staynas_staff_schedules_updated_at ON public.staynas_staff_schedules;
CREATE TRIGGER staynas_staff_schedules_updated_at
  BEFORE UPDATE ON public.staynas_staff_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.staynas_calendar_operational_events(
  _property_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  id uuid,
  event_kind text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  status text,
  room_id uuid,
  room_state_id uuid,
  booking_id uuid,
  assignee_id uuid,
  source_type text,
  source_id uuid,
  description text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _timezone text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Operations calendar access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF _to <= _from OR (_to - _from) > 93 THEN
    RAISE EXCEPTION 'Invalid calendar range';
  END IF;

  SELECT p.timezone INTO _timezone
  FROM public.staynas_properties p
  WHERE p.id = _property_id AND p.status = 'active';
  IF _timezone IS NULL THEN RAISE EXCEPTION 'Active property not found'; END IF;

  RETURN QUERY
  SELECT
    t.id,
    CASE WHEN t.category = 'maintenance' OR t.task_type ILIKE '%maintenance%' THEN 'maintenance' ELSE 'housekeeping' END,
    t.title,
    CASE
      WHEN t.status::text = 'in_progress'
        AND COALESCE(t.started_at, t.due_at, t.created_at) < (_from::timestamp AT TIME ZONE _timezone)
      THEN (_from::timestamp AT TIME ZONE _timezone)
      ELSE COALESCE(t.started_at, t.due_at, t.created_at)
    END,
    COALESCE(t.completed_at, CASE WHEN t.status::text = 'in_progress' THEN now() ELSE COALESCE(t.due_at, t.started_at, t.created_at) + interval '30 minutes' END),
    false,
    t.status::text,
    rs.room_id,
    rs.id,
    t.booking_id,
    COALESCE(t.assignee_id, t.assigned_to),
    'ops_task'::text,
    t.id,
    t.description
  FROM public.ops_tasks t
  JOIN public.room_states rs ON rs.id = t.room_state_id
  WHERE rs.property_id = _property_id
    AND t.category IN ('housekeeping','maintenance')
    AND t.status::text <> 'cancelled'
    AND COALESCE(t.started_at, t.due_at, t.created_at) < (_to::timestamp AT TIME ZONE _timezone)
    AND (
      (
        (COALESCE(t.started_at, t.due_at, t.created_at) AT TIME ZONE _timezone)::date >= _from
        AND (COALESCE(t.started_at, t.due_at, t.created_at) AT TIME ZONE _timezone)::date < _to
      )
      OR (
        t.status::text = 'in_progress'
        AND COALESCE(t.completed_at, now()) > (_from::timestamp AT TIME ZONE _timezone)
      )
    )

  UNION ALL

  SELECT
    e.id,
    CASE WHEN e.exception_type = 'maintenance' THEN 'maintenance' ELSE 'housekeeping' END,
    e.title,
    GREATEST(e.created_at, (_from::timestamp AT TIME ZONE _timezone)),
    COALESCE(e.resolved_at, now(), e.updated_at, e.created_at) + interval '30 minutes',
    false,
    e.status,
    rs.room_id,
    rs.id,
    rs.booking_id,
    e.assigned_to,
    'housekeeping_exception'::text,
    e.id,
    e.notes
  FROM public.housekeeping_exceptions e
  JOIN public.room_states rs ON rs.id = e.room_state_id
  WHERE rs.property_id = _property_id
    AND e.status = 'open'
    AND e.created_at < (_to::timestamp AT TIME ZONE _timezone)
    AND COALESCE(e.resolved_at, now()) >= (_from::timestamp AT TIME ZONE _timezone)

  UNION ALL

  SELECT
    s.id,
    'staff'::text,
    s.title,
    s.starts_at,
    s.ends_at,
    false,
    s.status,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    s.staff_user_id,
    'staff_schedule'::text,
    s.id,
    s.notes
  FROM public.staynas_staff_schedules s
  WHERE s.property_id = _property_id
    AND s.status <> 'cancelled'
    AND s.starts_at < (_to::timestamp AT TIME ZONE _timezone)
    AND s.ends_at > (_from::timestamp AT TIME ZONE _timezone)
    AND (
      s.staff_user_id = _uid
      OR public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
    )

  UNION ALL

  SELECT
    rs.id,
    'maintenance'::text,
    'Room unavailable: ' || replace(rs.state::text, '_', ' '),
    ((now() AT TIME ZONE _timezone)::date::timestamp AT TIME ZONE _timezone),
    (((now() AT TIME ZONE _timezone)::date + 1)::timestamp AT TIME ZONE _timezone),
    true,
    rs.state::text,
    rs.room_id,
    rs.id,
    rs.booking_id,
    NULL::uuid,
    'room_state'::text,
    rs.id,
    rs.state_note
  FROM public.room_states rs
  WHERE rs.property_id = _property_id
    AND rs.state::text IN ('maintenance','out_of_service')
    AND (_from <= (now() AT TIME ZONE _timezone)::date)
    AND (_to > (now() AT TIME ZONE _timezone)::date)

  ORDER BY 4;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_operational_events(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_operational_events(uuid,date,date) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.staynas_calendar_audit_events(
  _property_id uuid,
  _from date,
  _to date,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  event_type text,
  room_id uuid,
  booking_id uuid,
  hold_id uuid,
  date_from date,
  date_to date,
  actor_id uuid,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _timezone text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Operations calendar access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF _to <= _from OR (_to - _from) > 93 THEN
    RAISE EXCEPTION 'Invalid calendar range';
  END IF;
  IF _limit < 1 OR _limit > 200 THEN
    RAISE EXCEPTION 'Invalid event limit';
  END IF;

  SELECT p.timezone INTO _timezone
  FROM public.staynas_properties p
  WHERE p.id = _property_id AND p.status = 'active';
  IF _timezone IS NULL THEN RAISE EXCEPTION 'Active property not found'; END IF;

  RETURN QUERY
  SELECT e.id, e.event_type, e.room_id, e.booking_id, e.hold_id,
         e.date_from, e.date_to, e.actor_id, e.payload, e.created_at
  FROM public.calendar_events e
  WHERE (
    (e.room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = e.room_id AND r.property_id = _property_id
    ))
    OR (e.booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = e.booking_id AND b.property_id = _property_id
    ))
    OR (e.hold_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.booking_holds h
      WHERE h.id = e.hold_id AND h.property_id = _property_id
    ))
  )
  AND (
    (
      (e.date_from IS NOT NULL OR e.date_to IS NOT NULL)
      AND COALESCE(e.date_to, e.date_from) >= _from
      AND COALESCE(e.date_from, e.date_to) < _to
    )
    OR (
      e.date_from IS NULL AND e.date_to IS NULL
      AND (e.created_at AT TIME ZONE _timezone)::date >= _from
      AND (e.created_at AT TIME ZONE _timezone)::date < _to
    )
  )
  ORDER BY e.created_at DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_audit_events(uuid,date,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_audit_events(uuid,date,date,integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.staynas_calendar_list_staff(_property_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT pm.user_id, COALESCE(u.email, 'Staff member')::text
  FROM public.staynas_property_members pm
  JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.property_id = _property_id
    AND pm.status = 'active'
    AND public.staynas_user_has_property_access(pm.user_id, _property_id)
  ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_list_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_list_staff(uuid) TO authenticated, service_role;
