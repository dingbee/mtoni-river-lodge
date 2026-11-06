
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_policy p ON p.polrelid=c.oid
    WHERE n.nspname='public'
      AND c.relkind='r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS staynas_org_read_member ON public.staynas_organisations;
CREATE POLICY staynas_org_read_member
ON public.staynas_organisations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.staynas_properties p
  JOIN public.staynas_property_members pm ON pm.property_id=p.id
  WHERE p.organisation_id=staynas_organisations.id
    AND pm.user_id=auth.uid()
    AND pm.status='active'
));

DROP POLICY IF EXISTS staynas_property_read_member ON public.staynas_properties;
CREATE POLICY staynas_property_read_member
ON public.staynas_properties FOR SELECT TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(), id));

DROP POLICY IF EXISTS staynas_members_read_self ON public.staynas_property_members;
CREATE POLICY staynas_members_read_self
ON public.staynas_property_members FOR SELECT TO authenticated
USING (user_id=auth.uid());

DROP POLICY IF EXISTS staynas_context_select_self ON public.staynas_user_property_context;
CREATE POLICY staynas_context_select_self
ON public.staynas_user_property_context FOR SELECT TO authenticated
USING (user_id=auth.uid());

DROP POLICY IF EXISTS staynas_context_insert_self ON public.staynas_user_property_context;
CREATE POLICY staynas_context_insert_self
ON public.staynas_user_property_context FOR INSERT TO authenticated
WITH CHECK (
  user_id=auth.uid()
  AND public.staynas_user_has_property_access(auth.uid(), property_id)
);

DROP POLICY IF EXISTS staynas_context_update_self ON public.staynas_user_property_context;
CREATE POLICY staynas_context_update_self
ON public.staynas_user_property_context FOR UPDATE TO authenticated
USING (user_id=auth.uid())
WITH CHECK (
  user_id=auth.uid()
  AND public.staynas_user_has_property_access(auth.uid(), property_id)
);
