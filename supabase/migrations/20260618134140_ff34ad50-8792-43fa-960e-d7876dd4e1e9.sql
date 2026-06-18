
-- Switch read-only helpers to SECURITY INVOKER (RLS already permits public reads)
ALTER FUNCTION public.get_review_aggregates() SECURITY INVOKER;
ALTER FUNCTION public.get_room_availability(date, date) SECURITY INVOKER;

-- Lock down internal helpers from being called via PostgREST
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Defense-in-depth: explicitly deny client writes to user_roles
-- (RLS already denies by default; this makes the intent explicit and prevents
-- accidental future permissive policies from enabling self-role-assignment.)
CREATE POLICY "Deny client writes to user_roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
