
-- Room state enum
DO $$ BEGIN
  CREATE TYPE public.room_state AS ENUM (
    'vacant_clean','vacant_dirty','occupied','reserved','inspection','maintenance','out_of_service'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ops_alert_kind AS ENUM (
    'late_arrival','overdue_departure','payment_issue','room_conflict','maintenance_conflict'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- room_states: one per physical unit
CREATE TABLE IF NOT EXISTS public.room_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  unit_label text NOT NULL,
  state public.room_state NOT NULL DEFAULT 'vacant_clean',
  state_note text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, unit_label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_states TO authenticated;
GRANT ALL ON public.room_states TO service_role;
ALTER TABLE public.room_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage room_states" ON public.room_states
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER set_updated_at_room_states
  BEFORE UPDATE ON public.room_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed one row per room unit
INSERT INTO public.room_states (room_id, unit_label)
SELECT r.id, r.slug || '-' || lpad(gs::text, 2, '0')
FROM public.rooms r
CROSS JOIN LATERAL generate_series(1, r.total_units) gs
ON CONFLICT DO NOTHING;

-- Extend ops_tasks
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ops_tasks_status_due_idx ON public.ops_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS ops_tasks_assignee_status_idx ON public.ops_tasks(assignee_id, status);

-- ops_alerts
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_alerts TO authenticated;
GRANT ALL ON public.ops_alerts TO service_role;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage ops_alerts" ON public.ops_alerts
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER set_updated_at_ops_alerts
  BEFORE UPDATE ON public.ops_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS ops_alerts_open_idx ON public.ops_alerts(resolved_at) WHERE resolved_at IS NULL;

-- Views (SECURITY INVOKER — respect RLS of underlying tables)
CREATE OR REPLACE VIEW public.ops_today
WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM public.bookings WHERE check_in = CURRENT_DATE AND status IN ('confirmed','checked_in'))::int AS arrivals,
  (SELECT count(*) FROM public.bookings WHERE check_out = CURRENT_DATE AND status IN ('checked_in','completed'))::int AS departures,
  (SELECT count(*) FROM public.bookings WHERE status = 'checked_in')::int AS in_house,
  (SELECT count(*) FROM public.bookings WHERE check_in = CURRENT_DATE AND status = 'confirmed')::int AS pending_check_in,
  (SELECT count(*) FROM public.bookings WHERE check_out = CURRENT_DATE AND status = 'checked_in')::int AS pending_check_out,
  (SELECT count(*) FROM public.room_states WHERE state = 'vacant_dirty')::int AS dirty_rooms,
  (SELECT count(*) FROM public.room_states WHERE state IN ('maintenance','out_of_service'))::int AS maintenance_rooms,
  (SELECT count(*) FROM public.room_states WHERE state = 'vacant_clean')::int AS vacant_rooms,
  (SELECT count(*) FROM public.room_states WHERE state = 'occupied')::int AS occupied_rooms,
  (SELECT COALESCE(sum(balance_amount),0) FROM public.bookings WHERE balance_amount > 0 AND status NOT IN ('cancelled'))::numeric AS outstanding_total;

CREATE OR REPLACE VIEW public.ops_outstanding_balances
WITH (security_invoker = true) AS
SELECT id, reference, guest_name, guest_email, check_in, check_out, total, balance_amount, currency, status, payment_status, guest_id
FROM public.bookings
WHERE balance_amount > 0 AND status NOT IN ('cancelled')
ORDER BY check_in ASC;

GRANT SELECT ON public.ops_today TO authenticated;
GRANT SELECT ON public.ops_outstanding_balances TO authenticated;
