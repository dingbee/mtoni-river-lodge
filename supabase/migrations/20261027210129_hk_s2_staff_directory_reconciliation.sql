CREATE OR REPLACE FUNCTION public.housekeeping_list_staff()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.housekeeping_is_supervisor(_uid) THEN
    RAISE EXCEPTION 'Supervisor access required';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'housekeeping'::public.app_role
  )
  ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_staff() TO authenticated, service_role;
