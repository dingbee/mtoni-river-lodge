-- SN-IQ-05G: correct outer-row qualification in staff request insert policy.
-- The previous policy used unqualified property_id and guest_id inside EXISTS
-- subqueries, which PostgreSQL resolved against the inner booking/session rows.
-- Qualify the target row so booking, guest, and session scope are enforced.

DROP POLICY IF EXISTS "Property staff create guest requests"
  ON public.staynas_guest_requests;

CREATE POLICY "Property staff create guest requests"
  ON public.staynas_guest_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.staynas_user_has_property_access(
      auth.uid(),
      staynas_guest_requests.property_id
    )
    AND public.is_any_staff(auth.uid())
    AND (
      staynas_guest_requests.booking_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.bookings AS b
        WHERE b.id = staynas_guest_requests.booking_id
          AND b.property_id = staynas_guest_requests.property_id
          AND (
            staynas_guest_requests.guest_id IS NULL
            OR b.guest_id IS NULL
            OR b.guest_id = staynas_guest_requests.guest_id
          )
      )
    )
    AND (
      staynas_guest_requests.session_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.ai_concierge_sessions AS s
        WHERE s.id = staynas_guest_requests.session_id
          AND s.property_id = staynas_guest_requests.property_id
      )
    )
  );
