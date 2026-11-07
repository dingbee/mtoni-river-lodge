-- DC-05.08 disposable Housekeeping role and helper fixture.
-- Loaded only after the DC-05.07 PostgreSQL integration smoke test.

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM (
      'admin','reservations','user','owner','manager','reception',
      'marketing','housekeeping','finance','editor'
    );
  END IF;
END
$roles$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reception';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'housekeeping';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reservations';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;

-- The canonical HK execution schema uses assignee_id; the legacy operations
-- table fixture still exposes assigned_to for older non-HK tasks.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $task_status$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='ops_task_status'
  ) THEN
    CREATE TYPE public.ops_task_status AS ENUM ('pending','in_progress','completed','cancelled');
  END IF;
END
$task_status$;

ALTER TABLE public.ops_tasks
  ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.ops_tasks
  ALTER COLUMN status TYPE public.ops_task_status
  USING status::text::public.ops_task_status;
ALTER TABLE public.ops_tasks
  ALTER COLUMN status SET DEFAULT 'pending'::public.ops_task_status;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id,role)
);

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid,_roles public.app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=_user_id AND ur.role=ANY(_roles)
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $function$
  SELECT public.has_any_role(
    _user_id,
    ARRAY['owner','manager','admin','reception','housekeeping','finance','reservations']::public.app_role[]
  )
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at:=now();
  RETURN NEW;
END
$function$;
