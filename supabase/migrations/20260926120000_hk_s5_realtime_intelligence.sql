-- HK-S5 durable realtime/event layer and certification repairs
DROP POLICY IF EXISTS "Staff read housekeeping inspections" ON public.housekeeping_inspections;
CREATE POLICY "Housekeeping staff read inspections" ON public.housekeeping_inspections FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['housekeeping','owner','manager','admin']::public.app_role[]));
DROP POLICY IF EXISTS "Staff read housekeeping exceptions" ON public.housekeeping_exceptions;
CREATE POLICY "Housekeeping staff read exceptions" ON public.housekeeping_exceptions FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['housekeeping','owner','manager','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.housekeeping_next_inspection_attempt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 SELECT COALESCE(MAX(attempt_no),0)+1 INTO NEW.attempt_no FROM public.housekeeping_inspections WHERE room_state_id=NEW.room_state_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS housekeeping_inspections_attempt_no ON public.housekeeping_inspections;
CREATE TRIGGER housekeeping_inspections_attempt_no BEFORE INSERT ON public.housekeeping_inspections FOR EACH ROW EXECUTE FUNCTION public.housekeeping_next_inspection_attempt();
REVOKE ALL ON FUNCTION public.housekeeping_next_inspection_attempt() FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.housekeeping_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL,
 task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL, inspection_id uuid REFERENCES public.housekeeping_inspections(id) ON DELETE SET NULL,
 exception_id uuid REFERENCES public.housekeeping_exceptions(id) ON DELETE SET NULL, actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, correlation_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS housekeeping_events_created_idx ON public.housekeeping_events(created_at DESC);
ALTER TABLE public.housekeeping_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Housekeeping staff read events" ON public.housekeeping_events;
CREATE POLICY "Housekeeping staff read events" ON public.housekeeping_events FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),ARRAY['housekeeping','owner','manager','admin']::public.app_role[]));
REVOKE INSERT,UPDATE,DELETE ON public.housekeeping_events FROM anon,authenticated;
GRANT SELECT ON public.housekeeping_events TO authenticated; GRANT ALL ON public.housekeeping_events TO service_role;

CREATE TABLE IF NOT EXISTS public.housekeeping_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 event_id uuid NOT NULL REFERENCES public.housekeeping_events(id) ON DELETE CASCADE, kind text NOT NULL,title text NOT NULL,body text,href text,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recipient_user_id,event_id));
CREATE INDEX IF NOT EXISTS housekeeping_notifications_recipient_idx ON public.housekeeping_notifications(recipient_user_id,created_at DESC);
ALTER TABLE public.housekeeping_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own housekeeping notifications" ON public.housekeeping_notifications FOR SELECT TO authenticated USING((select auth.uid())=recipient_user_id);
CREATE POLICY "Users mark own housekeeping notifications" ON public.housekeeping_notifications FOR UPDATE TO authenticated USING((select auth.uid())=recipient_user_id) WITH CHECK((select auth.uid())=recipient_user_id);
REVOKE INSERT,DELETE ON public.housekeeping_notifications FROM anon,authenticated; GRANT SELECT,UPDATE ON public.housekeeping_notifications TO authenticated; GRANT ALL ON public.housekeeping_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.housekeeping_record_event(_event_type text,_room_state_id uuid DEFAULT NULL,_task_id uuid DEFAULT NULL,_inspection_id uuid DEFAULT NULL,_exception_id uuid DEFAULT NULL,_actor_id uuid DEFAULT NULL,_assignee_id uuid DEFAULT NULL,_payload jsonb DEFAULT '{}'::jsonb,_correlation_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid uuid; r uuid; title text;
BEGIN
 INSERT INTO public.housekeeping_events(event_type,room_state_id,task_id,inspection_id,exception_id,actor_id,assignee_id,payload,correlation_id) VALUES(_event_type,_room_state_id,_task_id,_inspection_id,_exception_id,COALESCE(_actor_id,auth.uid()),_assignee_id,COALESCE(_payload,'{}'::jsonb),_correlation_id) RETURNING id INTO eid;
 title:=initcap(replace(_event_type,'_',' '));
 IF _assignee_id IS NOT NULL AND _event_type IN('task_assigned','cleaning_started','cleaning_completed') THEN
  INSERT INTO public.housekeeping_notifications(recipient_user_id,event_id,kind,title,body,href) VALUES(_assignee_id,eid,_event_type,title,_payload->>'summary','/admin/operations/housekeeping') ON CONFLICT DO NOTHING;
 END IF;
 IF _event_type IN('inspection_requested','inspection_passed','inspection_failed','exception_reported','exception_resolved','room_ready','maintenance_escalated') THEN
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role=ANY(ARRAY['owner','manager','admin']::public.app_role[]) LOOP
   INSERT INTO public.housekeeping_notifications(recipient_user_id,event_id,kind,title,body,href) VALUES(r,eid,_event_type,title,_payload->>'summary','/admin/operations/housekeeping') ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public.housekeeping_record_event(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.housekeeping_record_event(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.hk_task_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.category='housekeeping' AND TG_OP='INSERT' THEN
  PERFORM public.housekeeping_record_event('task_created',NEW.room_state_id,NEW.id,NULL,NULL,auth.uid(),NEW.assignee_id,jsonb_build_object('summary',NEW.title,'priority',NEW.priority));
 ELSIF NEW.category='housekeeping' AND TG_OP='UPDATE' THEN
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN PERFORM public.housekeeping_record_event('task_assigned',NEW.room_state_id,NEW.id,NULL,NULL,auth.uid(),NEW.assignee_id,jsonb_build_object('summary',NEW.title)); END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN('in_progress','completed') THEN PERFORM public.housekeeping_record_event(CASE NEW.status WHEN 'in_progress' THEN 'cleaning_started' ELSE 'cleaning_completed' END,NEW.room_state_id,NEW.id,NULL,NULL,auth.uid(),NEW.assignee_id,jsonb_build_object('summary',NEW.title)); END IF;
 END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS housekeeping_ops_task_events ON public.ops_tasks;
CREATE TRIGGER housekeeping_ops_task_events AFTER INSERT OR UPDATE OF assignee_id,status ON public.ops_tasks FOR EACH ROW EXECUTE FUNCTION public.hk_task_events();

CREATE OR REPLACE FUNCTION public.hk_room_state_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.state='vacant_dirty' AND NEW.state='inspection' THEN PERFORM public.housekeeping_record_event('inspection_requested',NEW.id,NULL,NULL,NULL,auth.uid(),NULL,jsonb_build_object('summary',NEW.unit_label||' awaiting inspection'));
 ELSIF OLD.state='inspection' AND NEW.state='vacant_clean' THEN PERFORM public.housekeeping_record_event('room_ready',NEW.id,NULL,NULL,NULL,auth.uid(),NULL,jsonb_build_object('summary',NEW.unit_label||' is ready')); END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS housekeeping_room_state_events ON public.room_states;
CREATE TRIGGER housekeeping_room_state_events AFTER UPDATE OF state ON public.room_states FOR EACH ROW EXECUTE FUNCTION public.hk_room_state_events();

CREATE OR REPLACE FUNCTION public.hk_inspection_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid; BEGIN SELECT assignee_id INTO a FROM public.ops_tasks WHERE id=NEW.cleaning_task_id;
 IF TG_OP='INSERT' THEN PERFORM public.housekeeping_record_event('inspection_requested',NEW.room_state_id,NEW.cleaning_task_id,NEW.id,NULL,auth.uid(),a,jsonb_build_object('summary','Inspection requested','attempt_no',NEW.attempt_no));
 ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN('passed','failed') THEN PERFORM public.housekeeping_record_event(CASE NEW.status WHEN 'passed' THEN 'inspection_passed' ELSE 'inspection_failed' END,NEW.room_state_id,NEW.cleaning_task_id,NEW.id,NULL,auth.uid(),a,jsonb_build_object('summary',CASE NEW.status WHEN 'passed' THEN 'Room passed inspection' ELSE 'Re-clean required' END,'attempt_no',NEW.attempt_no)); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS housekeeping_inspection_events ON public.housekeeping_inspections;
CREATE TRIGGER housekeeping_inspection_events AFTER INSERT OR UPDATE OF status ON public.housekeeping_inspections FOR EACH ROW EXECUTE FUNCTION public.hk_inspection_events();

CREATE OR REPLACE FUNCTION public.hk_exception_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN PERFORM public.housekeeping_record_event(CASE WHEN NEW.exception_type='maintenance' THEN 'maintenance_escalated' ELSE 'exception_reported' END,NEW.room_state_id,NEW.task_id,NULL,NEW.id,auth.uid(),NEW.assigned_to,jsonb_build_object('summary',NEW.title,'type',NEW.exception_type,'severity',NEW.severity));
 ELSIF TG_OP='UPDATE' AND NEW.status='resolved' AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.housekeeping_record_event('exception_resolved',NEW.room_state_id,NEW.task_id,NULL,NEW.id,auth.uid(),NEW.assigned_to,jsonb_build_object('summary',NEW.title)); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS housekeeping_exception_events ON public.housekeeping_exceptions;
CREATE TRIGGER housekeeping_exception_events AFTER INSERT OR UPDATE OF status ON public.housekeeping_exceptions FOR EACH ROW EXECUTE FUNCTION public.hk_exception_events();

CREATE OR REPLACE FUNCTION public.housekeeping_get_dashboard()
RETURNS TABLE(active_tasks bigint,unassigned_tasks bigint,in_progress_tasks bigint,overdue_tasks bigint,inspection_pending bigint,exceptions_open bigint,rooms_ready bigint,failed_inspections_today bigint,avg_cleaning_minutes numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),ARRAY['housekeeping','owner','manager','admin']::public.app_role[]) THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 RETURN QUERY SELECT count(*) FILTER(WHERE status IN('pending','in_progress')),count(*) FILTER(WHERE status IN('pending','in_progress') AND assignee_id IS NULL),count(*) FILTER(WHERE status='in_progress'),count(*) FILTER(WHERE status IN('pending','in_progress') AND due_at IS NOT NULL AND due_at<now()),
 (SELECT count(*) FROM public.housekeeping_inspections WHERE status='pending'),(SELECT count(*) FROM public.housekeeping_exceptions WHERE status='open'),(SELECT count(*) FROM public.room_states WHERE state='vacant_clean'),(SELECT count(*) FROM public.housekeeping_inspections WHERE status='failed' AND inspected_at>=date_trunc('day',now())),
 COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM(completed_at-started_at))/60.0) FILTER(WHERE completed_at IS NOT NULL AND started_at IS NOT NULL AND completed_at>=now()-interval '7 days')::numeric,1),0) FROM public.ops_tasks WHERE category='housekeeping';
END $$;
CREATE OR REPLACE FUNCTION public.housekeeping_list_notifications(_limit integer DEFAULT 40)
RETURNS TABLE(id uuid,event_id uuid,kind text,title text,body text,href text,read_at timestamptz,created_at timestamptz) LANGUAGE sql SECURITY INVOKER AS $$ SELECT n.id,n.event_id,n.kind,n.title,n.body,n.href,n.read_at,n.created_at FROM public.housekeeping_notifications n WHERE n.recipient_user_id=(select auth.uid()) ORDER BY n.created_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit,40),1),100) $$;
CREATE OR REPLACE FUNCTION public.housekeeping_mark_notification_read(_id uuid) RETURNS public.housekeeping_notifications LANGUAGE sql SECURITY INVOKER AS $$ UPDATE public.housekeeping_notifications SET read_at=COALESCE(read_at,now()) WHERE id=_id AND recipient_user_id=(select auth.uid()) RETURNING * $$;
CREATE OR REPLACE FUNCTION public.housekeeping_list_intelligence() RETURNS TABLE(signal_type text,priority text,title text,reasoning text,room_id uuid,booking_id uuid,confidence numeric) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT i.insight_type,i.priority,i.title,i.reasoning,i.room_id,i.booking_id,i.confidence FROM public.ai_room_readiness_insights i WHERE i.status='pending' AND i.priority IN('critical','high') ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 20 $$;
REVOKE ALL ON FUNCTION public.housekeeping_get_dashboard() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.housekeeping_list_notifications(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.housekeeping_mark_notification_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.housekeeping_list_intelligence() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_get_dashboard() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_notifications(integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_mark_notification_read(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_intelligence() TO authenticated,service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='housekeeping_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_events; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='housekeeping_notifications') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_notifications; END IF;
END $$;
ALTER TABLE public.housekeeping_events REPLICA IDENTITY FULL; ALTER TABLE public.housekeeping_notifications REPLICA IDENTITY FULL;