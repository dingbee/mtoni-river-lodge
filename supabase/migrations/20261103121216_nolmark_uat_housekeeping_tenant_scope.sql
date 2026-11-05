-- StayNas: restore property isolation for Nolmark UAT housekeeping.
-- Safe to reapply: schema changes and UAT fixtures are idempotent.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

UPDATE public.ops_tasks t
SET property_id = rs.property_id
FROM public.room_states rs
WHERE t.property_id IS NULL AND t.room_state_id = rs.id;

UPDATE public.ops_tasks t
SET property_id = b.property_id
FROM public.bookings b
WHERE t.property_id IS NULL AND t.booking_id = b.id;

CREATE INDEX IF NOT EXISTS ops_tasks_property_hk_idx
  ON public.ops_tasks(property_id, category, status, assignee_id)
  WHERE category = 'housekeeping';

CREATE OR REPLACE FUNCTION public.staynas_enforce_ops_task_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _room_property uuid; _booking_property uuid;
BEGIN
  IF NEW.room_state_id IS NOT NULL THEN
    SELECT property_id INTO _room_property FROM public.room_states WHERE id=NEW.room_state_id;
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT property_id INTO _booking_property FROM public.bookings WHERE id=NEW.booking_id;
  END IF;
  IF NEW.property_id IS NULL THEN NEW.property_id := COALESCE(_room_property,_booking_property); END IF;
  IF _room_property IS NOT NULL AND NEW.property_id IS DISTINCT FROM _room_property THEN
    RAISE EXCEPTION 'Operational task property does not match its room';
  END IF;
  IF _booking_property IS NOT NULL AND NEW.property_id IS DISTINCT FROM _booking_property THEN
    RAISE EXCEPTION 'Operational task property does not match its booking';
  END IF;
  IF NEW.category='housekeeping' AND (NEW.property_id IS NULL OR NEW.room_state_id IS NULL) THEN
    RAISE EXCEPTION 'Housekeeping tasks require a property-scoped physical room';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ops_tasks_property_consistency_trg ON public.ops_tasks;
CREATE TRIGGER ops_tasks_property_consistency_trg
BEFORE INSERT OR UPDATE OF property_id, room_state_id, booking_id, category ON public.ops_tasks
FOR EACH ROW EXECUTE FUNCTION public.staynas_enforce_ops_task_property();

-- RLS must enforce the same tenant boundary as the server-side RPCs.
DROP POLICY IF EXISTS "Staff read ops_tasks" ON public.ops_tasks;
DROP POLICY IF EXISTS "Staff read own property ops_tasks" ON public.ops_tasks;
CREATE POLICY "Staff read own property ops_tasks" ON public.ops_tasks
FOR SELECT TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS "Staff read room_states" ON public.room_states;
DROP POLICY IF EXISTS "Staff read own property room_states" ON public.room_states;
CREATE POLICY "Staff read own property room_states" ON public.room_states
FOR SELECT TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS "Supervisors insert room_states" ON public.room_states;
DROP POLICY IF EXISTS "Supervisors insert own property room_states" ON public.room_states;
CREATE POLICY "Supervisors insert own property room_states" ON public.room_states
FOR INSERT TO authenticated WITH CHECK (
  public.staynas_user_has_property_access(auth.uid(), property_id)
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);

DROP POLICY IF EXISTS "Supervisors update room_states" ON public.room_states;
DROP POLICY IF EXISTS "Supervisors update own property room_states" ON public.room_states;
CREATE POLICY "Supervisors update own property room_states" ON public.room_states
FOR UPDATE TO authenticated USING (
  public.staynas_user_has_property_access(auth.uid(), property_id)
  AND public.is_any_staff(auth.uid())
  AND NOT public.has_any_role(auth.uid(), ARRAY['housekeeping']::public.app_role[])
) WITH CHECK (
  public.staynas_user_has_property_access(auth.uid(), property_id)
  AND public.is_any_staff(auth.uid())
  AND NOT public.has_any_role(auth.uid(), ARRAY['housekeeping']::public.app_role[])
);

DROP POLICY IF EXISTS "Supervisors delete room_states" ON public.room_states;
DROP POLICY IF EXISTS "Supervisors delete own property room_states" ON public.room_states;
CREATE POLICY "Supervisors delete own property room_states" ON public.room_states
FOR DELETE TO authenticated USING (
  public.staynas_user_has_property_access(auth.uid(), property_id)
  AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
);

DROP POLICY IF EXISTS "Housekeeping staff read inspections" ON public.housekeeping_inspections;
DROP POLICY IF EXISTS "Housekeeping staff read own property inspections" ON public.housekeeping_inspections;
CREATE POLICY "Housekeeping staff read own property inspections" ON public.housekeeping_inspections
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id=room_state_id
    AND public.staynas_user_has_property_access(auth.uid(),rs.property_id))
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
);

DROP POLICY IF EXISTS "Housekeeping staff read exceptions" ON public.housekeeping_exceptions;
DROP POLICY IF EXISTS "Housekeeping staff read own property exceptions" ON public.housekeeping_exceptions;
CREATE POLICY "Housekeeping staff read own property exceptions" ON public.housekeeping_exceptions
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.id=room_state_id
    AND public.staynas_user_has_property_access(auth.uid(),rs.property_id))
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
);

CREATE OR REPLACE FUNCTION public.housekeeping_list_work(_mine_only boolean DEFAULT false, _include_completed boolean DEFAULT false)
RETURNS TABLE(id uuid,room_state_id uuid,unit_label text,room_id uuid,room_name text,
 booking_id uuid,booking_reference text,guest_name text,status public.ops_task_status,
 priority integer,due_at timestamptz,assignee_id uuid,claimed_at timestamptz,started_at timestamptz,
 completed_at timestamptz,title text,description text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.is_any_staff(_uid)
 OR NOT public.has_any_role(_uid,ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT t.id,rs.id,rs.unit_label,r.id,r.name,t.booking_id,b.reference,b.guest_name,
 t.status,t.priority,t.due_at,t.assignee_id,t.claimed_at,t.started_at,t.completed_at,t.title,t.description
 FROM public.ops_tasks t
 JOIN public.room_states rs ON rs.id=t.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 LEFT JOIN public.bookings b ON b.id=t.booking_id AND b.property_id=_property_id
 WHERE t.property_id=_property_id AND t.category='housekeeping'
 AND (_include_completed OR t.status IN('pending','in_progress'))
 AND (NOT _mine_only OR t.assignee_id=_uid)
 ORDER BY CASE WHEN t.priority=1 THEN 0 WHEN t.priority=2 THEN 1 ELSE 2 END,t.due_at NULLS LAST,t.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_get_dashboard()
RETURNS TABLE(active_tasks bigint,unassigned_tasks bigint,in_progress_tasks bigint,overdue_tasks bigint,
 inspection_pending bigint,exceptions_open bigint,rooms_ready bigint,failed_inspections_today bigint,avg_cleaning_minutes numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.has_any_role(_uid,ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress')),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress') AND t.assignee_id IS NULL),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status='in_progress'),
 (SELECT count(*) FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping' AND t.status IN('pending','in_progress') AND t.due_at<now()),
 (SELECT count(*) FROM public.housekeeping_inspections i JOIN public.room_states rs ON rs.id=i.room_state_id WHERE rs.property_id=_property_id AND i.status='pending'),
 (SELECT count(*) FROM public.housekeeping_exceptions e JOIN public.room_states rs ON rs.id=e.room_state_id WHERE rs.property_id=_property_id AND e.status='open'),
 (SELECT count(*) FROM public.room_states rs WHERE rs.property_id=_property_id AND rs.state='vacant_clean'),
 (SELECT count(*) FROM public.housekeeping_inspections i JOIN public.room_states rs ON rs.id=i.room_state_id WHERE rs.property_id=_property_id AND i.status='failed' AND i.inspected_at>=date_trunc('day',now())),
 COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM(t.completed_at-t.started_at))/60.0)::numeric,1)
 FROM public.ops_tasks t WHERE t.property_id=_property_id AND t.category='housekeeping'
 AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL AND t.completed_at>=now()-interval '7 days'),0);
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_staff()
RETURNS TABLE(user_id uuid,email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.housekeeping_is_supervisor(_uid) THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT u.id,u.email::text FROM auth.users u
 JOIN public.staynas_property_members pm ON pm.user_id=u.id AND pm.property_id=_property_id AND pm.status='active'
 WHERE pm.role='housekeeping'::public.app_role ORDER BY u.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_inspection_queue()
RETURNS TABLE(inspection_id uuid,room_state_id uuid,cleaning_task_id uuid,attempt_no integer,status text,
 unit_label text,room_name text,room_id uuid,booking_id uuid,booking_reference text,guest_name text,
 completed_at timestamptz,checklist jsonb,notes text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.is_any_staff(_uid)
 OR NOT public.has_any_role(_uid,ARRAY['owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Supervisor access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT i.id,i.room_state_id,i.cleaning_task_id,i.attempt_no,i.status,rs.unit_label,r.name,r.id,
 t.booking_id,b.reference,b.guest_name,t.completed_at,i.checklist,i.notes
 FROM public.housekeeping_inspections i
 JOIN public.room_states rs ON rs.id=i.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 JOIN public.ops_tasks t ON t.id=i.cleaning_task_id AND t.property_id=_property_id
 LEFT JOIN public.bookings b ON b.id=t.booking_id AND b.property_id=_property_id
 WHERE i.status='pending' ORDER BY t.completed_at NULLS LAST,i.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_exceptions(_room_state_id uuid DEFAULT NULL,_open_only boolean DEFAULT true)
RETURNS TABLE(id uuid,room_state_id uuid,task_id uuid,exception_type text,status text,severity integer,title text,notes text,
 evidence jsonb,reported_by uuid,assigned_to uuid,resolved_by uuid,resolved_at timestamptz,created_at timestamptz,unit_label text,room_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.has_any_role(_uid,ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT e.id,e.room_state_id,e.task_id,e.exception_type,e.status,e.severity,e.title,e.notes,e.evidence,
 e.reported_by,e.assigned_to,e.resolved_by,e.resolved_at,e.created_at,rs.unit_label,r.name
 FROM public.housekeeping_exceptions e JOIN public.room_states rs ON rs.id=e.room_state_id AND rs.property_id=_property_id
 JOIN public.rooms r ON r.id=rs.room_id AND r.property_id=_property_id
 WHERE (_room_state_id IS NULL OR e.room_state_id=_room_state_id) AND (NOT _open_only OR e.status='open')
 ORDER BY e.severity,e.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_intelligence()
RETURNS TABLE(signal_type text,priority text,title text,reasoning text,room_id uuid,booking_id uuid,confidence numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _property_id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.has_any_role(_uid,ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
 _property_id:=public.staynas_active_property_id(_uid);
 IF _property_id IS NULL OR NOT public.staynas_user_has_property_access(_uid,_property_id)
 THEN RAISE EXCEPTION 'Active property access required'; END IF;
 RETURN QUERY SELECT i.insight_type,i.priority,i.title,i.reasoning,i.room_id,i.booking_id,i.confidence
 FROM public.ai_room_readiness_insights i JOIN public.rooms r ON r.id=i.room_id AND r.property_id=_property_id
 WHERE i.status='pending' AND i.priority IN('critical','high')
 ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 20;
END;
$$;

-- The helper functions were revoked from PUBLIC by the tenancy baseline;
-- explicitly restore authenticated/service-role execution for server RPCs.
GRANT EXECUTE ON FUNCTION public.staynas_active_property_id(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staynas_user_has_property_access(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_work(boolean,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_get_dashboard() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_staff() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_inspection_queue() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_exceptions(uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_intelligence() TO authenticated,service_role;

-- Seed Nolmark's existing UAT room types only; never touch Mtoni inventory.
INSERT INTO public.room_states(room_id,property_id,unit_label,state,state_note)
SELECT r.id,r.property_id,
 CASE r.slug WHEN 'demo-standard-room' THEN 'NOL-STD-'||lpad(g.n::text,2,'0')
 WHEN 'demo-deluxe-room' THEN 'NOL-DLX-'||lpad(g.n::text,2,'0')
 WHEN 'demo-family-suite' THEN 'NOL-FAM-'||lpad(g.n::text,2,'0') END,
 'vacant_dirty'::public.room_state,'Nolmark UAT housekeeping fixture for TestHK'
FROM public.rooms r CROSS JOIN LATERAL generate_series(1,r.total_units) g(n)
WHERE r.property_id=(SELECT id FROM public.staynas_properties WHERE code='NOLMARK')
AND r.slug IN('demo-standard-room','demo-deluxe-room','demo-family-suite')
AND NOT EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.room_id=r.id AND rs.unit_label=
 CASE r.slug WHEN 'demo-standard-room' THEN 'NOL-STD-'||lpad(g.n::text,2,'0')
 WHEN 'demo-deluxe-room' THEN 'NOL-DLX-'||lpad(g.n::text,2,'0')
 WHEN 'demo-family-suite' THEN 'NOL-FAM-'||lpad(g.n::text,2,'0') END);

INSERT INTO public.ops_tasks(property_id,room_state_id,task_type,category,title,description,priority,status,due_at,assignee_id,assigned_to)
SELECT rs.property_id,rs.id,'uat_room_turnover','housekeeping','UAT cleaning — '||rs.unit_label,
 'TestHK workflow test: clean room, start task, complete cleaning, then submit supervisor inspection. No guest booking is attached.',
 CASE WHEN rs.unit_label LIKE 'NOL-FAM-%' THEN 1 ELSE 2 END,'pending'::public.ops_task_status,
 now()+interval '4 hours',u.id,u.id
FROM public.room_states rs
JOIN public.staynas_property_members pm ON pm.property_id=rs.property_id AND pm.role='housekeeping'::public.app_role AND pm.status='active'
JOIN auth.users u ON u.id=pm.user_id AND lower(u.email)=lower('test1nolmark@gmail.com')
WHERE rs.property_id=(SELECT id FROM public.staynas_properties WHERE code='NOLMARK') AND rs.unit_label LIKE 'NOL-%'
AND NOT EXISTS (SELECT 1 FROM public.ops_tasks t WHERE t.property_id=rs.property_id
 AND t.room_state_id=rs.id AND t.category='housekeeping' AND t.title='UAT cleaning — '||rs.unit_label);
