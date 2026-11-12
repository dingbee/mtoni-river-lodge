-- Match the production room_state enum before applying the Housekeeping migrations.
DO $type$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='room_state'
  ) THEN
    CREATE TYPE public.room_state AS ENUM (
      'vacant_clean',
      'vacant_dirty',
      'occupied',
      'reserved',
      'inspection',
      'maintenance',
      'out_of_service'
    );
  END IF;
END
$type$;

ALTER TABLE public.room_states ALTER COLUMN state DROP DEFAULT;
ALTER TABLE public.room_states
  ALTER COLUMN state TYPE public.room_state
  USING state::text::public.room_state;
ALTER TABLE public.room_states
  ALTER COLUMN state SET DEFAULT 'vacant_clean'::public.room_state;

-- Minimal helper contract required by HK-S1 policy creation; DC-05.08 fixture
-- replaces it with the authenticated staff test implementation before UAT.
CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT false
$function$;

-- Core operations schema fields that predate HK-S2 but are not part of the
-- minimal DC-04 database fixture.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

DO $role_type$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='app_role'
 ¶»§q«^