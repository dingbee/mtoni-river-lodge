-- Disposable lifecycle dependencies for DC-05.04 PostgreSQL migration tests.
-- This fixture is isolated CI-only and contains no tenant or production data.
DO $type$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='booking_status') THEN
    CREATE TYPE public.booking_status AS ENUM
      ('pending','confirmed','checked_in','completed','cancelled','no_show');
  END IF;
END
$type$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS status public.booking_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.room_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  state text NOT NULL,
  booking_id uuid,
  unit_label text NOT NULL DEFAULT 'Fixture room',
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  booking_id uuid,
  room_state_id uuid,
  task_type text NOT NULL,
  category text,
  title text NOT NULL,
  priority integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'pending',
  due_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_label text,
  module text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'audit'
);

CREATE OR REPLACE FUNCTION public.staynas_transition_booking(
  _booking_id uuid,_target_status text,_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql AS $function$
  SELECT jsonb_build_object('ok',true,'booking_id',_booking_id,'status',_target_status)
$function$;
