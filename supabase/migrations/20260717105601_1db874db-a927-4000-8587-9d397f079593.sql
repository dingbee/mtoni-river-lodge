
-- Recommendations table
CREATE TABLE public.ai_guest_recommendations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete cascade,
  kind text not null check (kind in ('briefing','prep','opportunity','health')),
  title text not null,
  body text,
  reasoning text,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(4,3),
  expected_value numeric,
  category text,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed','converted')),
  action_task_id uuid references public.ops_tasks(id) on delete set null,
  created_by uuid,
  actioned_by uuid,
  actioned_at timestamptz,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX ai_rec_booking_idx ON public.ai_guest_recommendations(booking_id);
CREATE INDEX ai_rec_guest_idx ON public.ai_guest_recommendations(guest_id);
CREATE INDEX ai_rec_kind_status_idx ON public.ai_guest_recommendations(kind, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_guest_recommendations TO authenticated;
GRANT ALL ON public.ai_guest_recommendations TO service_role;
ALTER TABLE public.ai_guest_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read guest recs"
ON public.ai_guest_recommendations FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','reservations']::public.app_role[])
  OR (public.has_role(auth.uid(),'marketing'::public.app_role) AND kind IN ('briefing','opportunity','prep'))
  OR (public.has_role(auth.uid(),'finance'::public.app_role) AND category = 'payment')
);
CREATE POLICY "staff write guest recs"
ON public.ai_guest_recommendations FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]));

CREATE TRIGGER trg_ai_rec_updated BEFORE UPDATE ON public.ai_guest_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Alerts table
CREATE TABLE public.ai_guest_alerts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete cascade,
  kind text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null,
  detail text,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','dismissed','assigned','converted')),
  assigned_to uuid,
  task_id uuid references public.ops_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid
);
CREATE INDEX ai_alert_status_idx ON public.ai_guest_alerts(status);
CREATE INDEX ai_alert_booking_idx ON public.ai_guest_alerts(booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_guest_alerts TO authenticated;
GRANT ALL ON public.ai_guest_alerts TO service_role;
ALTER TABLE public.ai_guest_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read guest alerts"
ON public.ai_guest_alerts FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','reservations']::public.app_role[])
  OR (public.has_role(auth.uid(),'finance'::public.app_role) AND kind IN ('outstanding_balance','payment_issue'))
  OR (public.has_role(auth.uid(),'marketing'::public.app_role) AND kind IN ('birthday','anniversary','repeat_guest','high_value_guest'))
);
CREATE POLICY "staff write guest alerts"
ON public.ai_guest_alerts FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]));

CREATE TRIGGER trg_ai_alert_updated BEFORE UPDATE ON public.ai_guest_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
