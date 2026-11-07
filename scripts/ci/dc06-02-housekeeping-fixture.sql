-- DC-06.02 disposable Housekeeping dependencies for the DC-05.07 CI schema.
-- Production already owns these through the Housekeeping/property foundation.
CREATE TABLE IF NOT EXISTS public.housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_state_id uuid NOT NULL REFERENCES public.room_states(id) ON DELETE CASCADE,
  cleaning_task_id uuid NOT NULL REFERENCES public.ops_tasks(id) ON DELETE RESTRICT,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dc06_02_housekeeping_inspection_task_idx
  ON public.housekeeping_inspections(cleaning_task_id,created_at DESC);

DO $role_type$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('owner','manager','admin','housekeeping');
  END IF;
END
$role_type$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid,_roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT false
$function$;

-- The focused DC-05 CI fixture omits the property-context migration. The smoke
-- test replaces this inert stub with its deterministic fixture-property resolver.
CREATE OR REPLACE FUNCTION public.staynas_active_property_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULL::uuid
$function$;
