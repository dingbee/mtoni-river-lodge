
-- Automation & Workflow Engine schema

CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_template boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT false,
  approver_roles text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage workflows" ON public.workflows FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]));

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_event text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending|running|succeeded|failed|awaiting_approval|cancelled
  conditions_met boolean,
  error text,
  retry_count int NOT NULL DEFAULT 0,
  correlation_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON public.workflow_runs(workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON public.workflow_runs(status, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_runs TO service_role;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read workflow runs" ON public.workflow_runs FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Staff manage workflow runs" ON public.workflow_runs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]));

CREATE TABLE IF NOT EXISTS public.workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_index int NOT NULL,
  step_type text NOT NULL,
  step_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON public.workflow_run_steps(run_id, step_index);
GRANT SELECT, INSERT, UPDATE ON public.workflow_run_steps TO authenticated;
GRANT ALL ON public.workflow_run_steps TO service_role;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read step logs" ON public.workflow_run_steps FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text,
  channel text NOT NULL DEFAULT 'in_app', -- in_app|email|whatsapp|sms
  title text NOT NULL,
  body text,
  href text,
  kind text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON public.notifications(role, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]));
CREATE POLICY "Users mark own read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  cron_expression text NOT NULL,
  job_type text NOT NULL, -- daily_revenue|weekly_occupancy|monthly_financial|arrivals_digest|seo_audit|backup_reminder|custom
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_jobs TO authenticated;
GRANT ALL ON public.scheduled_jobs TO service_role;
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage scheduled jobs" ON public.scheduled_jobs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]));

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  approver_roles text[] NOT NULL DEFAULT '{}',
  approval_kind text NOT NULL, -- refund|discount|rate_change|homepage_publish|role_change|custom
  subject text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending|approved|rejected|cancelled
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.approval_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read approvals" ON public.approval_requests FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Staff create approvals" ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()));
CREATE POLICY "Managers decide approvals" ON public.approval_requests FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::app_role[]));

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON public.workflows;
CREATE TRIGGER trg_workflows_updated_at BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_scheduled_jobs_updated_at ON public.scheduled_jobs;
CREATE TRIGGER trg_scheduled_jobs_updated_at BEFORE UPDATE ON public.scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed workflow templates
INSERT INTO public.workflows (name, description, trigger_event, conditions, actions, is_template, enabled)
VALUES
  ('Booking Confirmation', 'Send confirmation email when a reservation is confirmed', 'reservation.updated',
    '[{"field":"meta.to","op":"eq","value":"confirmed"}]'::jsonb,
    '[{"type":"send_email","template":"booking-confirmed"},{"type":"add_note","text":"Confirmation email dispatched"}]'::jsonb,
    true, true),
  ('Pre-Arrival Reminder', 'Reminder 48h before check-in', 'reservation.created',
    '[]'::jsonb,
    '[{"type":"schedule_followup","delay_hours":-48,"template":"pre-arrival"}]'::jsonb,
    true, true),
  ('Airport Pickup Reminder', 'Notify staff when airport pickup task exists', 'task.created',
    '[{"field":"meta.category","op":"eq","value":"airport_pickup"}]'::jsonb,
    '[{"type":"notify_staff","role":"reception","title":"Airport pickup scheduled"}]'::jsonb,
    true, true),
  ('Welcome Message', 'WhatsApp welcome after check-in', 'reservation.checked_in',
    '[]'::jsonb,
    '[{"type":"send_whatsapp","template":"welcome"}]'::jsonb,
    true, true),
  ('Check-out Follow-up', 'Thank-you email after check-out', 'reservation.checked_out',
    '[]'::jsonb,
    '[{"type":"send_email","template":"checkout-followup"}]'::jsonb,
    true, true),
  ('Review Request', 'Ask for review 24h after check-out', 'reservation.checked_out',
    '[]'::jsonb,
    '[{"type":"schedule_followup","delay_hours":24,"template":"review-request"}]'::jsonb,
    true, true),
  ('Birthday Greeting', 'Send birthday email to guest', 'guest.updated',
    '[{"field":"meta.reason","op":"eq","value":"birthday"}]'::jsonb,
    '[{"type":"send_email","template":"birthday"}]'::jsonb,
    true, true),
  ('VIP Arrival Preparation', 'Create VIP prep tasks on VIP booking', 'reservation.created',
    '[{"field":"meta.guest_type","op":"eq","value":"vip"}]'::jsonb,
    '[{"type":"create_task","title":"VIP arrival prep","priority":1},{"type":"notify_staff","role":"manager","title":"VIP arrival"}]'::jsonb,
    true, true),
  ('Outstanding Payment Reminder', 'Reminder when balance is overdue', 'payment.received',
    '[{"field":"meta.status","op":"eq","value":"overdue"}]'::jsonb,
    '[{"type":"send_email","template":"payment-pending"},{"type":"create_task","title":"Chase outstanding balance"}]'::jsonb,
    true, true)
ON CONFLICT DO NOTHING;

-- Seed scheduled jobs (definitions only; execution via /api/public/hooks/cron)
INSERT INTO public.scheduled_jobs (name, description, cron_expression, job_type, enabled)
VALUES
  ('Daily Revenue Summary', 'Executive revenue summary at 07:00', '0 7 * * *', 'daily_revenue', true),
  ('Weekly Occupancy Report', 'Monday morning occupancy summary', '0 8 * * 1', 'weekly_occupancy', true),
  ('Monthly Financial Report', 'First of month financial report', '0 9 1 * *', 'monthly_financial', true),
  ('Arrivals Digest', 'Tomorrow''s arrivals every evening', '0 18 * * *', 'arrivals_digest', true),
  ('SEO Audit Reminder', 'Weekly SEO health check', '0 9 * * 1', 'seo_audit', true),
  ('Backup Reminder', 'Weekly backup verification', '0 6 * * 0', 'backup_reminder', true)
ON CONFLICT (name) DO NOTHING;
