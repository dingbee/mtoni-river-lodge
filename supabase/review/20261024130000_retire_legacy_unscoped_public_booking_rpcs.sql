-- Review record for production migration: retire_legacy_unscoped_public_booking_rpcs
-- Applied to the linked production database after all public app call sites were
-- moved to explicit *_for_property contracts. Keep this in supabase/review/
-- until it is deliberately promoted into the migration ledger.
--
-- The legacy overloads embed the original single-property scope and must not
-- remain executable by anon/authenticated in a multi-tenant platform.

REVOKE EXECUTE ON FUNCTION public.get_room_availability(date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_hold(text,date,date,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_booking_hold(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_booking_hold_for_session(uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_room_availability(date,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_hold(text,date,date,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_booking_hold(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_booking_hold_for_session(uuid,text) TO service_role;
