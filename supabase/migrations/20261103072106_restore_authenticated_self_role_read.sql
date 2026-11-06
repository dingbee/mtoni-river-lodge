
-- Permit authenticated users to read only their own legacy role rows.
-- Preserve the existing deny-all client write policy.
GRANT SELECT ON TABLE public.user_roles TO authenticated;

DROP POLICY IF EXISTS "Users can read their own role assignments" ON public.user_roles;
CREATE POLICY "Users can read their own role assignments"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));
