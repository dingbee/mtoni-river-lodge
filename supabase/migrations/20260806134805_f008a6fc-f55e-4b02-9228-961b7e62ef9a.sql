REVOKE ALL ON FUNCTION public.checkin_sync_reservation(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_sync_reservation(uuid, jsonb) TO service_role;