
-- ============================================================
-- Front Desk Command System
-- ============================================================

-- 1. guest_type on bookings
DO $$ BEGIN
  CREATE TYPE public.guest_type AS ENUM ('standard','vip','climber');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_type public.guest_type NOT NULL DEFAULT 'standard';

-- 2. guest_threads
CREATE TABLE IF NOT EXISTS public.guest_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.guest_threads TO authenticated;
GRANT ALL ON public.guest_threads TO service_role;
ALTER TABLE public.guest_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage guest_threads" ON public.guest_threads;
CREATE POLICY "Staff manage guest_threads" ON public.guest_threads
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 3. email_events (booking-scoped mirror)
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  template_name text,
  message_id text,
  recipient_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_booking_idx ON public.email_events(booking_id, occurred_at DESC);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read email_events" ON public.email_events;
CREATE POLICY "Staff read email_events" ON public.email_events
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 4. ops_tasks
DO $$ BEGIN
  CREATE TYPE public.ops_task_status AS ENUM ('pending','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority int NOT NULL DEFAULT 2,
  status public.ops_task_status NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_tasks_status_idx ON public.ops_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS ops_tasks_booking_idx ON public.ops_tasks(booking_id);
GRANT SELECT, INSERT, UPDATE ON public.ops_tasks TO authenticated;
GRANT ALL ON public.ops_tasks TO service_role;
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage ops_tasks" ON public.ops_tasks;
CREATE POLICY "Staff manage ops_tasks" ON public.ops_tasks
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
DROP TRIGGER IF EXISTS ops_tasks_updated_at ON public.ops_tasks;
CREATE TRIGGER ops_tasks_updated_at BEFORE UPDATE ON public.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. whatsapp_alerts
CREATE TABLE IF NOT EXISTS public.whatsapp_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  to_number text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_sid text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_alerts_booking_idx ON public.whatsapp_alerts(booking_id, created_at DESC);
GRANT SELECT ON public.whatsapp_alerts TO authenticated;
GRANT ALL ON public.whatsapp_alerts TO service_role;
ALTER TABLE public.whatsapp_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whatsapp_alerts" ON public.whatsapp_alerts;
CREATE POLICY "Staff read whatsapp_alerts" ON public.whatsapp_alerts
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 6. pending_notifications queue (drained by /api/public/ops/drain)
CREATE TABLE IF NOT EXISTS public.pending_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_notifications_unprocessed_idx
  ON public.pending_notifications(created_at) WHERE processed_at IS NULL;
GRANT SELECT ON public.pending_notifications TO authenticated;
GRANT ALL ON public.pending_notifications TO service_role;
ALTER TABLE public.pending_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read pending_notifications" ON public.pending_notifications;
CREATE POLICY "Staff read pending_notifications" ON public.pending_notifications
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 7. Helper: detect guest_type from special_requests/visit_purpose
CREATE OR REPLACE FUNCTION public.detect_guest_type(_special text, _purpose text)
RETURNS public.guest_type
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(_special,'') || ' ' || COALESCE(_purpose,'') ILIKE '%kilimanjaro%'
      OR COALESCE(_special,'') || ' ' || COALESCE(_purpose,'') ILIKE '%climb%'
      OR COALESCE(_special,'') || ' ' || COALESCE(_purpose,'') ILIKE '%trek%'
      THEN 'climber'::public.guest_type
    WHEN COALESCE(_special,'') ILIKE '%vip%' THEN 'vip'::public.guest_type
    ELSE 'standard'::public.guest_type
  END
$$;

-- 8. AFTER INSERT trigger on bookings
CREATE OR REPLACE FUNCTION public.handle_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gt public.guest_type;
BEGIN
  _gt := public.detect_guest_type(NEW.special_requests, NEW.visit_purpose);
  IF _gt <> NEW.guest_type THEN
    UPDATE public.bookings SET guest_type = _gt WHERE id = NEW.id;
  END IF;

  -- seed guest thread
  INSERT INTO public.guest_threads (booking_id, timeline)
  VALUES (NEW.id, jsonb_build_array(jsonb_build_object(
    'at', now(), 'type', 'booking_created',
    'message', 'Booking ' || NEW.reference || ' created'
  )))
  ON CONFLICT (booking_id) DO NOTHING;

  -- payment follow-up task
  INSERT INTO public.ops_tasks (booking_id, task_type, title, description, priority, due_at)
  VALUES (
    NEW.id, 'payment_followup',
    'Confirm payment for ' || NEW.reference,
    'Deposit pending — follow up with ' || NEW.guest_name,
    CASE WHEN _gt <> 'standard' THEN 1 ELSE 2 END,
    now() + interval '24 hours'
  );

  -- VIP / climber priority task
  IF _gt = 'vip' THEN
    INSERT INTO public.ops_tasks (booking_id, task_type, title, priority)
    VALUES (NEW.id, 'vip_handling', 'VIP arrival prep — ' || NEW.guest_name, 1);
  ELSIF _gt = 'climber' THEN
    INSERT INTO public.ops_tasks (booking_id, task_type, title, description, priority)
    VALUES (NEW.id, 'climber_logistics',
      'Kilimanjaro logistics — ' || NEW.guest_name,
      'Confirm transport, gear storage, early breakfast', 1);
  END IF;

  -- queue notification
  INSERT INTO public.pending_notifications (booking_id, event_type, payload)
  VALUES (NEW.id, 'booking_created', jsonb_build_object('guest_type', _gt));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_after_insert_frontdesk ON public.bookings;
CREATE TRIGGER bookings_after_insert_frontdesk
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_insert();

-- 9. AFTER UPDATE trigger on bookings
CREATE OR REPLACE FUNCTION public.handle_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := 'status_' || NEW.status::text;
    UPDATE public.guest_threads
      SET timeline = timeline || jsonb_build_object(
        'at', now(), 'type', _event,
        'message', 'Status changed: ' || OLD.status || ' → ' || NEW.status),
        last_updated = now()
      WHERE booking_id = NEW.id;
    INSERT INTO public.pending_notifications (booking_id, event_type, payload)
    VALUES (NEW.id, _event, jsonb_build_object('from', OLD.status, 'to', NEW.status));

    IF NEW.status = 'confirmed' THEN
      INSERT INTO public.ops_tasks (booking_id, task_type, title, description, due_at, priority)
      VALUES (NEW.id, 'room_prep',
        'Prepare room for ' || NEW.guest_name,
        'Check-in on ' || NEW.check_in,
        (NEW.check_in - interval '1 day')::timestamptz, 2);
    END IF;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    _event := 'payment_' || NEW.payment_status::text;
    UPDATE public.guest_threads
      SET timeline = timeline || jsonb_build_object(
        'at', now(), 'type', _event,
        'message', 'Payment ' || OLD.payment_status || ' → ' || NEW.payment_status),
        last_updated = now()
      WHERE booking_id = NEW.id;
    INSERT INTO public.pending_notifications (booking_id, event_type, payload)
    VALUES (NEW.id, _event, jsonb_build_object('from', OLD.payment_status, 'to', NEW.payment_status));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_after_update_frontdesk ON public.bookings;
CREATE TRIGGER bookings_after_update_frontdesk
  AFTER UPDATE OF status, payment_status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_update();

-- 10. Mirror email_send_log → email_events when booking_id is parseable from message_id-less data
-- We'll write email_events from app code (more flexible than parsing in SQL).

-- 11. Backfill guest_threads for existing bookings
INSERT INTO public.guest_threads (booking_id, timeline)
SELECT b.id, jsonb_build_array(jsonb_build_object(
  'at', b.created_at, 'type', 'booking_created',
  'message', 'Booking ' || b.reference || ' created'))
FROM public.bookings b
LEFT JOIN public.guest_threads t ON t.booking_id = b.id
WHERE t.id IS NULL;
