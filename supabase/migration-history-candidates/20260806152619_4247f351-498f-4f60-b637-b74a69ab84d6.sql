REVOKE EXECUTE ON FUNCTION public.arrival_pass_validate(text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.arrival_pass_confirm(text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.arrival_pass_validate(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arrival_pass_confirm(text, jsonb) TO authenticated, service_role;