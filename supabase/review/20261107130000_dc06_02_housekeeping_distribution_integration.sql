-- DC-06.02 — Distribution-to-Housekeeping visibility.
-- Review-only until the DC-05 operational integration baseline is separately approved.
-- Read-only projection: this function never mutates bookings, allocations, room state or tasks.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_operational_reservations') IS NULL
     OR to_regclass('public.staynas_distribution_room_allocations') IS NULL
     OR to_regclass('public.housekeeping_inspections') IS NULL
     OR to_regclass('public.ops_tasks') IS NULL
     OR to_regclass('public.room_states') IS NULL
     OR to_regprocedure('public.staynas_active_property_id(uuid)') IS NULL
     OR to_regprocedure('public.staynas_user_has_property_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'DC-06.02 requires DC-05.07 operational projections and the property-scoped Housekeeping foundation.';
  END IF;
END
$dependencies$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_distribution_handoffs()
RETURNS TABLE (
  booking_id uuid,
  booking_reference text,
  guest_name text,
  provider_key text,
  external_reservation_id text,
  provider_status text,
  integration_status text,
  last_error_code text,
  check_in date,
  check_out date,
  room_state_id uuid,
  unit_label text,
  room_name text,
  room_state text,
  allocation_status text,
  turnover_task_id uuid,
  turnover_task_status text,
  inspection_status text,
  last_integrated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid)
     OR NOT public.has_any_role(
       _uid,
       ARRAY['housekeeping','owner','manager','admin']::public.app_role[]
     ) THEN
    RAISE EXCEPTION 'Housekeeping access required.' USING ERRCODE='42501';
  END IF;

  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid,_property_id) THEN
    RAISE EXCEPTION 'Active property access required.' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    o.booking_id,
    b.reference,
    b.guest_name,
    o.provider_key,
    o.external_reservation_id,
    o.provider_status,
    o.integration_status,
    o.last_error_code,
    b.check_in,
    b.check_out,
    COALESCE(o.room_state_id,a.room_state_id),
    rs.unit_label,
    r.name,
    rs.state::text,
    a.allocation_status,
    turnover.id,
    turnover.status,
    inspection.status,
    o.last_integrated_at
  FROM public.staynas_distribution_operational_reservations o
  JOIN public.bookings b
    ON b.id=o.booking_id AND b.property_id=o.property_id
  LEFT JOIN public.staynas_distribution_room_allocations a
    ON a.booking_id=o.booking_id AND a.property_id=o.property_id
  LEFT JOIN public.room_states rs
    ON rs.id=COALESCE(o.room_state_id,a.room_state_id)
  LEFT JOIN public.rooms r
    ON r.id=rs.room_id AND r.property_id=o.property_id
  LEFT JOIN LATERAL (
    SELECT t.id,t.status::text AS status
    FROM public.ops_tasks t
    WHERE t.booking_id=o.booking_id
      AND t.property_id=o.property_id
      AND t.category='housekeeping'
      AND t.task_type='channel_housekeeping_turnover'
    ORDER BY t.created_at DESC,t.id DESC
    LIMIT 1
  ) turnover ON true
  LEFT JOIN LATERAL (
    SELECT i.status::text AS status
    FROM public.housekeeping_inspections i
    WHERE i.cleaning_task_id=turnover.id
    ORDER BY i.created_at DESC,i.id DESC
    LIMIT 1
  ) inspection ON true
  WHERE o.property_id=_property_id
    AND (
      o.integration_status <> 'integrated'
      OR turnover.status IN ('pending','in_progress')
      OR (turnover.status='completed' AND COALESCE(inspection.status,'') <> 'passed')
    )
  ORDER BY
    CASE WHEN o.integration_status <> 'integrated' THEN 0 ELSE 1 END,
    b.check_in,
    o.last_integrated_at DESC
  LIMIT 100;
END;
$function$;

REVOKE ALL ON FUNCTION public.housekeeping_list_distribution_handoffs()
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_distribution_handoffs()
  TO authenticated,service_role;

COMMENT ON FUNCTION public.housekeeping_list_distribution_handoffs()
IS 'Read-only, active-property-scoped distribution handoff and turnover visibility for Housekeeping.';

COMMIT;
