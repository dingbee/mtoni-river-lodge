-- Allow staff role readers to use the existing self-read policy while
-- continuing to deny every client-side mutation of role assignments.
--
-- The previous restrictive FOR ALL policy also applied to SELECT, which
-- unintentionally blocked all client reads from public.user_roles.

DROP POLICY IF EXISTS "Deny client writes to user_roles" ON public.user_roles;

CREATE POLICY "Deny client inserts to user_roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client updates to user_roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny client deletes to user_roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);
