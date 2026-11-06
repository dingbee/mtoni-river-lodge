CREATE OR REPLACE FUNCTION public.staynas_current_property_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.role::text
  FROM public.staynas_user_property_context c
  JOIN public.staynas_property_members pm
    ON pm.property_id = c.property_id
   AND pm.user_id = c.user_id
  WHERE c.user_id = auth.uid()
    AND pm.status = 'active'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.staynas_current_property_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_current_property_role() TO authenticated, service_role;