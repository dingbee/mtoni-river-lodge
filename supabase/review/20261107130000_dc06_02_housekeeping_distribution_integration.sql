-- DC-06.02 â€” Distribution-to-Housekeeping visibility.
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
SET search_path ¶»§q«^