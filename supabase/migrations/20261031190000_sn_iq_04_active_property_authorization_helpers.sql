-- SN-IQ-04 prerequisite: tenant-scope legacy concierge sessions using
-- verified hostname-to-property ownership, then install active-property helpers.
BEGIN;
ALTER TABLE public.ai_concierge_sessions ADD COLUMN IF NOT EXISTS property_id uuid;

DO $backfill$
BEGIN
 UPDATE public.ai_concierge_sessions s
 SET property_id=d.property_id
 FROM public.staynas_property_domains d
 WHERE s.property_id IS NULL
   AND lower(regexp_replace(split_part(split_part(s.referer,'/',3),':',1),'^www\\.',''))=lower(d.hostname);
 IF EXISTS (SELECT 1 FROM public.ai_concierge_sessions WHERE property_id IS NULL) THEN
  RAISE EXCEPTION 'Unmapped concierge sessions remain; refusing tenant assignment';
 END IF;
END
$backfill$;

ALTER TABLE public.ai_concierge_sessions ALTER COLUMN property_id SET NOT NULL;
DO $fk$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_concierge_sessions_property_id_fkey' AND conrelid='public.ai_concierge_sessions'::regclass) THEN
  ALTER TABLE public.ai_concierge_sessions ADD CONSTRAINT ai_concierge_sessions_property_id_fkey
   FOREIGN KEY(property_id) REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
 END IF;
END
$fk$;
CREATE INDEX IF NOT EXISTS ai_concierge_sessions_property_channel_activity_idx
 ON public.ai_concierge_sessions(property_id,channel,last_active_at DESC);

CREATE OR REPLACE FUNCTION public.staynas_ai_property_in_active_context(p_property_id uuid,p_allowed_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.staynas_user_property_context c
  JOIN public.staynas_property_members pm ON pm.user_id=c.user_id AND pm.property_id=c.property_id
  WHERE c.user_id=auth.uid() AND c.property_id=p_property_id AND pm.status='active' AND pm.role=ANY(p_allowed_roles)
 );
$$;
CREATE OR REPLACE FUNCTION public.staynas_ai_session_in_active_property(p_session_id uuid,p_allowed_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.ai_concierge_sessions s WHERE s.id=p_session_id AND public.staynas_ai_property_in_active_context(s.property_id,p_allowed_roles));
$$;
REVOKE ALL ON FUNCTION public.staynas_ai_property_in_active_context(uuid,public.app_role[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.staynas_ai_session_in_active_property(uuid,public.app_role[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staynas_ai_property_in_active_context(uuid,public.app_role[]) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staynas_ai_session_in_active_property(uuid,public.app_role[]) TO authenticated,service_role;
COMMIT;
