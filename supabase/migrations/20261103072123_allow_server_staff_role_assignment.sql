
-- The server-side staff invitation workflow may inspect and assign legacy roles.
-- Do not grant these operations to anon or authenticated clients.
GRANT SELECT, INSERT ON TABLE public.user_roles TO service_role;
