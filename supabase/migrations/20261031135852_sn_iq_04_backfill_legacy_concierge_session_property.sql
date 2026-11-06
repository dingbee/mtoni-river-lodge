DO $$
BEGIN
 UPDATE public.ai_concierge_sessions s
 SET property_id=d.property_id
 FROM public.staynas_property_domains d
 WHERE s.property_id IS NULL
   AND lower(regexp_replace(split_part(split_part(s.referer,'/',3),':',1),'^www\.','')) = lower(d.hostname);
 IF EXISTS (SELECT 1 FROM public.ai_concierge_sessions WHERE property_id IS NULL) THEN
   RAISE EXCEPTION 'Unmapped concierge sessions remain; refusing tenant assignment';
 END IF;
END $$;
ALTER TABLE public.ai_concierge_sessions ALTER COLUMN property_id SET NOT NULL;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_concierge_sessions_property_id_fkey' AND conrelid='public.ai_concierge_sessions'::regclass) THEN
  ALTER TABLE public.ai_concierge_sessions ADD CONSTRAINT ai_concierge_sessions_property_id_fkey FOREIGN KEY(property_id) REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS ai_concierge_sessions_property_channel_activity_idx ON public.ai_concierge_sessions(property_id,channel,last_active_at DESC);