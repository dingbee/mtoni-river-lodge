-- Staff module readers need the complete role roster, not only their own
-- assignment. The server functions separately enforce owner/manager access.
CREATE POLICY "Staff managers can read all role assignments"
  ON public.user_roles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner', 'manager']::public.app_role[]));
