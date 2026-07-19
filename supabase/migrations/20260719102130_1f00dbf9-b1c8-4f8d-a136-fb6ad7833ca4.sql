
DROP POLICY IF EXISTS "Anyone reads by id" ON public.booking_holds;

CREATE OR REPLACE FUNCTION public.get_booking_hold_for_session(_hold_id uuid, _session_id text)
RETURNS TABLE (
  id uuid, room_id uuid, check_in date, check_out date,
  expires_at timestamptz, status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.room_id, h.check_in, h.check_out, h.expires_at, h.status::text
  FROM public.booking_holds h
  WHERE h.id = _hold_id
    AND _session_id IS NOT NULL
    AND length(trim(_session_id)) >= 6
    AND h.session_id = _session_id
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_hold_for_session(uuid, text) TO anon, authenticated;
