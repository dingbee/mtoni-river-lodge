-- DC-05.07 â€” channel reservation operational integration.
-- Review-only migration. CI/UAT artifact; never apply to production without separate approval.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_reservation_links') IS NULL
     OR to_regclass('public.staynas_distribution_webhook_inbox') IS NULL
     OR to_regclass('public.staynas_distribution_financial_evidence') IS NULL
     OR to_regclass('public.bookings') IS NULL
     OR to_regclass('public.guests') IS NULL
     OR to_regclass('public.room_states') IS NULL
     OR to_regclass('public.ops_tasks') IS NULL
     OR to_regclass('public.ops_alerts') IS NULL
     OR to_regclass('public.housekeeping_transition_log') IS NULL
     OR to_regprocedure('public.staynas_user_has_property_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'DC-05.07 requires canonical bookings, guest CRM, room states, operations and DC-05.06 finance evidence';
  END IF;
END
$dependencies$;

-- Extend the existing operating tables with the property keys they lacked.
-- Backfill from their canonical booking/room relations before replacing the
-- former global-staff RLS policies.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL;
UPDATE public.ops_tasks t
SET property_id=b.property_id
FROM public.bookings b
WHERE t.booking_id=b.id AND t.p¶»§q«^