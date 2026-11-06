
CREATE TABLE public.ai_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  domains_accessed TEXT[] NOT NULL DEFAULT '{}',
  tool_called TEXT,
  tool_args JSONB NOT NULL DEFAULT '{}'::jsonb,
  response TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_activity_logs TO authenticated;
GRANT ALL ON public.ai_activity_logs TO service_role;

ALTER TABLE public.ai_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own ai logs"
  ON public.ai_activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own ai logs"
  ON public.ai_activity_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners/managers read all ai logs"
  ON public.ai_activity_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE INDEX ai_activity_logs_user_created_idx ON public.ai_activity_logs(user_id, created_at DESC);
CREATE INDEX ai_activity_logs_created_idx ON public.ai_activity_logs(created_at DESC);
