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

-- The focused DC-05 CI fixture omits the property-context migration. The smoke
-- test replaces this inert stub with its deterministic fixture-property resolver.
CREATE OR REPLACE FUNCTION public.staynas_active_property_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULL::uuid
$function$;
