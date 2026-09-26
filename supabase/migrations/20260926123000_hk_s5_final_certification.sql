-- HK-S5 final certification hardening
-- Remove duplicate inspection-request events: inspection creation is the canonical request event.
CREATE OR REPLACE FUNCTION public.hk_room_state_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF OLD.state='inspection' AND NEW.state='vacant_clean' THEN
    PERFORM public.housekeeping_record_event(
      'room_ready', NEW.id, NULL, NULL, NULL, auth.uid(), NULL,
      jsonb_build_object('summary', NEW.unit_label || ' is ready')
    );
  END IF;
  RETURN NEW;
END $$;

-- Make inspection attempt numbering concurrency-safe.
CREATE OR REPLACE FUNCTION public.housekeeping_next_inspection_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_state_id::text, 0));
  SELECT COALESCE(MAX(attempt_no),0)+1
    INTO NEW.attempt_no
    FROM public.housekeeping_inspections
   WHERE room_state_id=NEW.room_state_id;
  RETURN NEW;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS housekeeping_inspections_room_attempt_uidx
  ON public.housekeeping_inspections(room_state_id, attempt_no);

-- Keep the event catalogue explicit so malformed event names cannot enter the durable stream.
ALTER TABLE public.housekeeping_events
  DROP CONSTRAINT IF EXISTS housekeeping_events_event_type_check;
ALTER TABLE public.housekeeping_events
  ADD CONSTRAINT housekeeping_events_event_type_check
  CHECK (event_type IN (
    'task_created','task_assigned','cleaning_started','cleaning_completed',
    'inspection_requested','inspection_passed','inspection_failed',
    'exception_reported','exception_resolved','maintenance_escalated','room_ready'
  ));

-- Notify the directly responsible housekeeper for execution and inspection outcomes,
-- and supervisors for management-significant events.
CREATE OR REPLACE FUNCTION public.housekeeping_record_event(
  _event_type text,
  _room_state_id uuid DEFAULT NULL,
  _task_id uuid DEFAULT NULL,
  _inspection_id uuid DEFAULT NULL,
  _exception_id uuid DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb,
  _correlation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  eid uuid;
  r uuid;
  title text;
BEGIN
  INSERT INTO public.housekeeping_events(
    event_type,room_state_id,task_id,inspection_id,exception_id,
    actor_id,assignee_id,payload,correlation_id
  )
  VALUES(
    _event_type,_room_state_id,_task_id,_inspection_id,_exception_id,
    COALESCE(_actor_id,auth.uid()),_assignee_id,COALESCE(_payload,'{}'::jsonb),_correlation_id
  )
  RETURNING id INTO eid;

  title := initcap(replace(_event_type,'_',' '));

  IF _assignee_id IS NOT NULL
     AND _event_type IN (
       'task_assigned','cleaning_started','cleaning_completed',
       'inspection_requested','inspection_passed','inspection_failed',
       'exception_reported','exception_resolved','maintenance_escalated'
     )
  THEN
    INSERT INTO public.housekeeping_notifications(
      recipient_user_id,event_id,kind,title,body,href
    )
    VALUES(
      _assignee_id,eid,_event_type,title,
      _payload->>'summary','/admin/operations/housekeeping'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF _event_type IN (
    'task_created','task_assigned','inspection_requested','inspection_passed',
    'inspection_failed','exception_reported','exception_resolved',
    'room_ready','maintenance_escalated'
  )
  THEN
    FOR r IN
      SELECT DISTINCT user_id
        FROM public.user_roles
       WHERE role=ANY(ARRAY['owner','manager','admin']::public.app_role[])
    LOOP
      INSERT INTO public.housekeeping_notifications(
        recipient_user_id,event_id,kind,title,body,href
      )
      VALUES(
        r,eid,_event_type,title,
        _payload->>'summary','/admin/operations/housekeeping'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN eid;
END $$;

REVOKE ALL ON FUNCTION public.housekeeping_record_event(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.housekeeping_record_event(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) TO service_role;

-- The realtime client maps every durable S5 event into the existing platform event taxonomy.
