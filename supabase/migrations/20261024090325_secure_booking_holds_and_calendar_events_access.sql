BEGIN;

-- Booking holds are manipulated only through narrowly validated SECURITY DEFINER RPCs.
-- Deny direct client-table access and make row-level security an additional guardrail.
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_holds FROM anon, authenticated;

-- Calendar events are read by signed-in staff; scope every visible event to a property
-- the current user is an active member of. Events without a linked property-bearing
-- room, booking, or hold remain invisible to client roles.
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.calendar_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.calendar_events TO authenticated;

DROP POLICY IF EXISTS "Staff read calendar events for accessible properties" ON public.calendar_events;
CREATE POLICY "Staff read calendar events for accessible properties"
ON public.calendar_events
FOR SELECT
TO authenticated
USING (
  (room_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = calendar_events.room_id
      AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
  ))
  OR (booking_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = calendar_events.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  ))
  OR (hold_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.booking_holds h
    JOIN public.rooms r ON r.id = h.room_id
    WHERE h.id = calendar_events.hold_id
      AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
  ))
);

COMMIT;