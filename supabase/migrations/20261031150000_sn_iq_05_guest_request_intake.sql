-- SN-IQ-05: operational guest request intake and deterministic categorisation.
-- This is a separate request ledger; operational task dispatch is handled by the
-- next SN-IQ-05 workstream so intake cannot silently mutate departmental tasks.

CREATE TABLE IF NOT EXISTS public.staynas_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.ai_concierge_sessions(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN (
    'housekeeping','room_service','dining','airport_transfer','maintenance',
    'special_occasion','private_dining','complaint','service_recovery','other'
  )),
  request_text text NOT NULL CHECK (length(trim(request_text)) BETWEEN 3 AND 2000),
  intake_channel text NOT NULL DEFAULT 'staff' CHECK (intake_channel IN ('web','whatsapp','email','staff')),
  status text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received','triaged','assigned','in_progress','fulfilled','cancelled','escalated'
  )),
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  guest_name text,
  guest_contact text,
  requested_for timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staynas_guest_requests_property_status_idx
  ON public.staynas_guest_requests(property_id, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_guest_requests_booking_idx
  ON public.staynas_guest_requests(booking_id, created_at DESC)
  WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staynas_guest_requests_session_idx
  ON public.staynas_guest_requests(session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.staynas_guest_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_guest_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staynas_guest_requests TO authenticated;
GRANT ALL ON public.staynas_guest_requests TO service_role;

DROP POLICY IF EXISTS "Property staff read guest requests" ON public.staynas_guest_requests;
CREATE POLICY "Property staff read guest requests"
  ON public.staynas_guest_requests FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS "Property staff create guest requests" ON public.staynas_guest_requests;
CREATE POLICY "Property staff create guest requests"
  ON public.staynas_guest_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.is_any_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Property managers update guest requests" ON public.staynas_guest_requests;
CREATE POLICY "Property managers update guest requests"
  ON public.staynas_guest_requests FOR UPDATE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[])
  );

DROP TRIGGER IF EXISTS staynas_guest_requests_updated_at ON public.staynas_guest_requests;
CREATE TRIGGER staynas_guest_requests_updated_at
  BEFORE UPDATE ON public.staynas_guest_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.staynas_guest_requests IS
'Property-scoped intake ledger for guest concierge requests. Does not represent fulfilment until linked operational work is completed.';
