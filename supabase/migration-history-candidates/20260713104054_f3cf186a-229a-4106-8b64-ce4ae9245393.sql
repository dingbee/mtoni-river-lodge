ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS correlation_id uuid;

CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON public.activity_logs(module);
CREATE INDEX IF NOT EXISTS idx_activity_logs_correlation ON public.activity_logs(correlation_id);

ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_severity_check;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_severity_check
  CHECK (severity IN ('info','warn','error','audit'));