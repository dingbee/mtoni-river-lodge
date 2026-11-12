-- DC-06.03-only auth helper stand-ins for disposable PostgreSQL CI.
-- Production auth/role/property functions are not replaced or changed.
DO $type$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('owner','manager','finance','admin');
  END IF;
END
$type$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid,_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE AS $function$
  SELECT false
$function$;
