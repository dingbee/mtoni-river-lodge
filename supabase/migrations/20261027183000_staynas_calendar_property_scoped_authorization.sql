-- P4 authorization hardening: property-scoped access for existing operational calendar RPCs.
-- This migration must be verified in CI and preview before production application.

CREATE OR REPLACE FUNCTION public.staynas_calendar_list_staff(_property_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF NOT public.staynas_calendar_has_property_role(
    _uid, _property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ) THEN
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

CREATE OR REPLACE FUNCTION public.staynas_calendar_operational_events(
  _property_id uuid,
  _from date,
  _to date
)
RETURNS TABLE(
  id uuid, event_kind text, title text, starts_at timestamptz, ends_at timestamptz,
  all_day boolean, status text, room_id uuid, room_state_id uuid, booking_id uuid,
  assignee_id uuid, source_type text, source_id uuid, description text
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
  IF _uid IS NULL OR NOT public.staynas_calendar_has_property_role(
    _uid, _property_id,
    ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[]
  ) THEN
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
        AND COALESCE(t.due_at, t.created_at) < (_from::timestamp AT TIME ZONE _timezone)
      THEN (_from::timestamp AT TIME ZONE _timezone)
      ELSE COALESCE(t.due_at, t.created_at)
    END,
    COALESCE(t.completed_at, CASE WHEN t.status::text = 'in_progress' THEN now() ELSE COALESCE(t.due_at, t.created_at, t.created_at) + interval '30 minutes' END),
    false,
    t.status::text,
    b.room_id,
    NULL::uuid,
    t.booking_id,
    COALESCE(t.assignee_id, t.assigned_to),
    'ops_task'::text,
    t.id,
    t.description
  FROM public.ops_tasks t
  JOIN public.bookings b ON b.id = t.booking_id AND b.property_id = _property_id
  WHERE t.booking_id IS NOT NULL
    AND t.category IN ('housekeeping','maintenance')
    AND t.status::text <> 'cancelled'
    AND COALESCE(t.due_at, t.created_at) < (_to::timestamp AT TIME ZONE _timezone)
    AND (
      (
        (COALESCE(t.due_at, t.created_at) AT TIME ZONE _timezone)::date >= _from
        AND (COALESCE(t.due_at, t.created_at) AT TIME ZONE _timezone)::date < _to
      )
      OR (
        t.status::text = 'in_progress'
        AND COALESCE(t.completed_at, now()) > (_from::timestamp AT TIME ZONE _timezone)
      )
    )

  UNION ALL

  SELECT
    s.id, 'staff'::text, s.title, s.starts_at, s.ends_at, false, s.status,
    NULL::uuid, NULL::uuid, NULL::uuid, s.staff_user_id,
    'staff_schedule'::text, s.id, s.notes
  FROM public.staynas_staff_schedules s
  WHERE s.property_id = _property_id
    AND s.status <> 'cancelled'
    AND s.starts_at < (_to::timestamp AT TIME ZONE _timezone)
    AND s.ends_at > (_from::timestamp AT TIME ZONE _timezone)
    AND public.staynas_user_has_property_access(s.staff_user_id, _property_id)
    AND (
      s.staff_user_id = _uid
      OR public.staynas_calendar_has_property_role(
        _uid, _property_id, ARRAY['owner','manager','admin']::public.app_role[]
      )
    )

  UNION ALL

  SELECT
    rs.id, 'maintenance'::text, 'Room unavailable: ' || replace(rs.state::text, '_', ' '),
    ((now() AT TIME ZONE _timezone)::date::timestamp AT TIME ZONE _timezone),
    (((now() AT TIME ZONE _timezone)::date + 1)::timestamp AT TIME ZONE _timezone),
    true, rs.state::text, rs.room_id, rs.id, rs.booking_id, NULL::uuid,
    'room_state'::text, rs.id, rs.state_note
  FROM public.room_states rs
  WHERE rs.property_id = _property_id
    AND rs.state::text IN ('maintenance','out_of_service')
    AND (_from <= (now() AT TIME ZONE _timezone)::date)
    AND (_to > (now() AT TIME ZONE _timezone)::date)

  ORDER BY 4;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_list_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_list_staff(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.staynas_calendar_operational_events(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_operational_events(uuid,date,date) TO authenticated;
