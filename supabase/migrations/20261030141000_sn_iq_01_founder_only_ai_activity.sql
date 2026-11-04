-- AI activity logs are currently global and do not carry a property_id.
-- Until tenant-scoped audit streams are implemented, only the platform founder
-- administrator may read the global feed.
DROP POLICY IF EXISTS "Owners/managers read all ai logs" ON public.ai_activity_logs;
DROP POLICY IF EXISTS "Founder can read global ai activity logs" ON public.ai_activity_logs;

CREATE POLICY "Founder can read global ai activity logs"
  ON public.ai_activity_logs
  FOR SELECT TO authenticated
  USING (public.is_staynas_founder_ai_admin());
