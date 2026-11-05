-- HK-S5 follow-up hardening: maintenance exceptions and intelligence authorization.
CREATE OR REPLACE FUNCTION public.housekeeping_exception_maintenance_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.room_states%ROWTYPE;
BEGIN
 IF NEW.exception_type='maintenance' AND NEW.task_id IS NULL THEN
  SELECT * INTO r FROM public.room_states WHERE id=NEW.room_state_id;
  IF FOUND THEN
   INSERT INTO public.ops_tasks(booking_id,task_type,category,title,description,priority,due_at,room_state_id)
   VALUES(r.booking_id,'housekeeping_maintenance','maintenance','Maintenance: '||NEW.title,
     concat_ws(E'\n',NULLIF(trim(COALESCE(NEW.notes,'')),''),'Reported from Housekeeping.'),
     NEW.severity,now()+CASE WHEN NEW.severity=1 THEN interval '30 minutes' ELSE interval '2 hours' END,NEW.room_state_id);
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS housekeeping_exception_maintenance_escalation ON public.housekeeping_exceptions;
CREATE TRIGGER housekeeping_exception_maintenance_escalation AFTER INSERT ON public.housekeeping_exceptions FOR EACH ROW EXECUTE FUNCTION public.housekeeping_exception_maintenance_escalation();
REVOKE ALL ON FUNCTION public.housekeeping_exception_maintenance_escalation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.housekeeping_list_intelligence()
RETURNS TABLE(signal_type text,priority text,title text,reasoning text,room_id uuid,booking_id uuid,confidence numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),ARRAY['housekeeping','owner','manager','admin']::public.app_role[]) THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 RETURN QUERY SELECT i.insight_type,i.priority,i.title,i.reasoning,i.room_id,i.booking_id,i.confidence
 FROM public.ai_room_readiness_insights i WHERE i.status='pending' AND i.priority IN('critical','high')
 ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.housekeeping_list_intelligence() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_intelligence() TO authenticated,service_role;