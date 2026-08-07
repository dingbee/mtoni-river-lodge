
REVOKE EXECUTE ON FUNCTION public.restaurant_is_platform_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restaurant_can_read(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restaurant_can_write(uuid, public.restaurant_role[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.restaurant_is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_can_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_can_write(uuid, public.restaurant_role[]) TO authenticated, service_role;
