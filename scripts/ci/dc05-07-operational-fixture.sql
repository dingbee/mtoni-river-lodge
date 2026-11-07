-- Disposable dependencies for DC-05.07 operational integration tests only.
-- Loaded after canonical materialization and lifecycle CI fixtures.

CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $function$ SELECT false $function$;

ALTER TABLE public.staynas_properties
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_id uuid,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone_e164 text,
  full_name text NOT NULL,
  country text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dc05_07_guest_email_uidx
  ON public.guests(lower(email)) WHERE email IS NOT NULL AND is_deleted=false;

CREATE OR REPLACE FUNCTION public.bookings_link_guest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE v_guest_id uuid;
BEGIN
  SELECT g.id INTO v_guest_id FROM public.guests g
  WHERE lower(g.email)=lower(trim(NEW.guest_email)) AND g.is_deleted=false
  LIMIT 1;
  IF v_guest_id IS NULL THEN
    INSERT INTO public.guests(email,phone_e164,full_name,country)
    VALUES(lower(trim(NEW.guest_email)),NEW.guest_phone,NEW.guest_name,NEW.country)
    RETURNING id INTO v_guest_id;
  END IF;
  NEW.guest_id:=v_guest_id;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS bookings_link_guest_trg ON public.bookings;
CREATE TRIGGER bookings_link_guest_trg
  BEFORE INSERT OR UPDATE OF guest_email,guest_name,guest_phone,country ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_link_guest();

ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
-- Simulate the real pre-DC-05.07 schema: property and physical-unit keys are
-- added by the review migration, not pre-seeded by this fixture.
ALTER TABLE public.ops_tasks
  DROP COLUMN IF EXISTS property_id,
  DROP COLUMN IF EXISTS room_state_id;

DO $type$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='ops_alert_kind') THEN
    CREATE TYPE public.ops_alert_kind AS ENUM
      ('late_arrival','overdue_departure','payment_issue','room_conflict','maintenance_conflict');
  END IF;
END
$type$;

CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.ops_alert_kind NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  message text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ops_alerts DROP COLUMN IF EXISTS property_id;
