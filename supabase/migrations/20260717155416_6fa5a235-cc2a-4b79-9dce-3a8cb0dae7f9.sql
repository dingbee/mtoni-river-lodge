
-- Sprint 9I: AI Knowledge Intelligence & Monitoring

-- 1. Extend ai_knowledge_sources with quality signals
ALTER TABLE public.ai_knowledge_sources
  ADD COLUMN IF NOT EXISTS completeness_score numeric,
  ADD COLUMN IF NOT EXISTS freshness_score numeric,
  ADD COLUMN IF NOT EXISTS usage_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

-- 2. Scheduler config (single row, id=1)
CREATE TABLE IF NOT EXISTS public.ai_knowledge_scheduler_config (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  cron_expression text NOT NULL DEFAULT '0 2 * * *',
  tasks jsonb NOT NULL DEFAULT '["journal","cms","rooms"]'::jsonb,
  freshness_rules jsonb NOT NULL DEFAULT
    '{"journal_article":90,"policy":180,"room":30,"experience":60,"website_page":30,"document":180,"other":180}'::jsonb,
  confidence_threshold numeric NOT NULL DEFAULT 0.6,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_knowledge_scheduler_singleton CHECK (id = 1)
);

GRANT SELECT ON public.ai_knowledge_scheduler_config TO authenticated;
GRANT ALL ON public.ai_knowledge_scheduler_config TO service_role;
ALTER TABLE public.ai_knowledge_scheduler_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read scheduler config" ON public.ai_knowledge_scheduler_config
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "managers manage scheduler config" ON public.ai_knowledge_scheduler_config
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE TRIGGER trg_ai_knowledge_scheduler_config_updated
  BEFORE UPDATE ON public.ai_knowledge_scheduler_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_knowledge_scheduler_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 3. Sync run log
CREATE TABLE IF NOT EXISTS public.ai_knowledge_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  triggered_by text NOT NULL DEFAULT 'cron',
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_knowledge_sync_runs TO authenticated;
GRANT ALL ON public.ai_knowledge_sync_runs TO service_role;
ALTER TABLE public.ai_knowledge_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read sync runs" ON public.ai_knowledge_sync_runs
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_sync_runs_started ON public.ai_knowledge_sync_runs (started_at DESC);

-- 4. Notifications
CREATE TABLE IF NOT EXISTS public.ai_knowledge_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ai_knowledge_notifications TO authenticated;
GRANT ALL ON public.ai_knowledge_notifications TO service_role;
ALTER TABLE public.ai_knowledge_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read notifications" ON public.ai_knowledge_notifications
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "managers manage notifications" ON public.ai_knowledge_notifications
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE TRIGGER trg_ai_knowledge_notifications_updated
  BEFORE UPDATE ON public.ai_knowledge_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_notifications_status ON public.ai_knowledge_notifications (status, created_at DESC);
