
-- system_errors: captured server-side errors
CREATE TABLE public.system_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('debug','info','warn','error','fatal')),
  source TEXT NOT NULL DEFAULT 'server-fn',
  module TEXT,
  function_name TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT,
  user_id UUID,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_system_errors_occurred_at ON public.system_errors (occurred_at DESC);
CREATE INDEX idx_system_errors_unresolved ON public.system_errors (occurred_at DESC) WHERE resolved = false;
CREATE INDEX idx_system_errors_module ON public.system_errors (module, occurred_at DESC);

GRANT SELECT, UPDATE ON public.system_errors TO authenticated;
GRANT ALL ON public.system_errors TO service_role;

ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins view errors"
  ON public.system_errors FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "Owners and admins update errors"
  ON public.system_errors FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- system_health_probes: rolling health check log
CREATE TABLE public.system_health_probes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  probe_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','degraded','down')),
  latency_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_system_health_probes_checked_at ON public.system_health_probes (checked_at DESC);
CREATE INDEX idx_system_health_probes_name_time ON public.system_health_probes (probe_name, checked_at DESC);

GRANT SELECT ON public.system_health_probes TO authenticated;
GRANT ALL ON public.system_health_probes TO service_role;

ALTER TABLE public.system_health_probes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins view probes"
  ON public.system_health_probes FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

-- Trim function called opportunistically by /api/public/health (no cron dependency)
CREATE OR REPLACE FUNCTION public.system_observability_trim()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.system_health_probes WHERE checked_at < now() - interval '30 days';
  DELETE FROM public.system_errors WHERE resolved = true AND resolved_at < now() - interval '90 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.system_observability_trim() FROM PUBLIC, anon, authenticated;
