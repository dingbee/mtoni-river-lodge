BEGIN;

-- Per-property, per-priority SLA policy. Defaults are explicit 24x7 operating
-- policies and are editable by property managers; all deadlines are persisted UTC.
CREATE TABLE IF NOT EXISTS public.ai_escalation_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 3),
  enabled boolean NOT NULL DEFAULT true,
  acknowledgement_minutes integer NOT NULL CHECK (acknowledgement_minutes BETWEEN 1 AND 10080),
  assignment_minutes integer NOT NULL CHECK (assignment_minutes BETWEEN 1 AND 10080),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes BETWEEN 1 AND 43200),
  business_hours_only boolean NOT NULL DEFAULT false,
  operating_hours jsonb NOT NULL DEFAULT '{"mode":"24x7"}'::jsonb,
  warning_percent integer NOT NULL DEFAULT 80 CHECK (warning_percent BETWEEN 1 AND 99),
  notification_channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  reason_priority_map jsonb NOT NULL DEFAULT '{"complaint":1,"payment_issue":1,"human_requested":2,"low_confidence":2,"complex_request":3,"other":3}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, priority),
  CHECK (jsonb_typeof(operating_hours) = 'object'),
  CHECK (notification_channels <@ ARRAY['in_app']::text[])
);

INSERT INTO public.ai_escalation_sla_policies
  (property_id, priority, acknowledgement_minutes, assignment_minutes, resolution_minutes)
SELECT p.id, priorities.priority,
  CASE priorities.priority WHEN 1 THEN 15 WHEN 2 THEN 30 ELSE 60 END,
  CASE priorities.priority WHEN 1 THEN 10 WHEN 2 THEN 20 ELSE 30 END,
  CASE priorities.priority WHEN 1 THEN 120 WHEN 2 THEN 240 ELSE 480 END
FROM public.staynas_properties p
CROSS JOIN (VALUES (1::smallint),(2::smallint),(3::smallint)) priorities(priority)
ON CONFLICT (property_id,priority) DO NOTHING;

ALTER TABLE public.ai_escalations DROP CONSTRAINT IF EXISTS ai_escalations_status_check;
ALTER TABLE public.ai_escalations ADD CONSTRAINT ai_escalations_status_check
  CHECK (status IN ('open','assigned','acknowledged','in_progress','resolved','dismissed'));

CREATE TABLE IF NOT EXISTS public.ai_escalation_sla_policy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES public.ai_escalation_sla_policies(id) ON DELETE RESTRICT,
  priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 3),
  event_type text NOT NULL CHECK (event_type IN ('created','updated','enabled','disabled')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_policy jsonb,
  new_policy jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_escalation_sla_policy_events_property_time_idx
  ON public.ai_escalation_sla_policy_events(property_id,occurred_at DESC);
ALTER TABLE public.ai_escalation_sla_policy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_escalation_sla_policy_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_escalation_sla_policy_events TO authenticated;
GRANT SELECT,INSERT ON public.ai_escalation_sla_policy_events TO service_role;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.ai_escalation_sla_policy_events FROM PUBLIC,anon,authenticated,service_role;
DROP POLICY IF EXISTS "SLA policy audit read in active property" ON public.ai_escalation_sla_policy_events;
CREATE POLICY "SLA policy audit read in active property"
  ON public.ai_escalation_sla_policy_events FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(property_id,ARRAY['owner','manager','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.staynas_record_escalation_sla_policy_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public
AS $function$
DECLARE v_type text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_type := 'created';
    INSERT INTO public.ai_escalation_sla_policy_events(property_id,policy_id,priority,event_type,actor_id,new_policy)
    VALUES (NEW.property_id,NEW.id,NEW.priority,v_type,auth.uid(),to_jsonb(NEW));
  ELSE
    v_type := CASE WHEN OLD.enabled IS DISTINCT FROM NEW.enabled
      THEN CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END
      ELSE 'updated' END;
    INSERT INTO public.ai_escalation_sla_policy_events(property_id,policy_id,priority,event_type,actor_id,old_policy,new_policy)
    VALUES (NEW.property_id,NEW.id,NEW.priority,v_type,COALESCE(auth.uid(),NEW.updated_by),to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS ai_escalation_sla_policy_audit ON public.ai_escalation_sla_policies;
CREATE TRIGGER ai_escalation_sla_policy_audit
  AFTER INSERT OR UPDATE ON public.ai_escalation_sla_policies
  FOR EACH ROW EXECUTE FUNCTION public.staynas_record_escalation_sla_policy_event();

INSERT INTO public.ai_escalation_sla_policy_events(property_id,policy_id,priority,event_type,new_policy)
SELECT property_id,id,priority,'created',to_jsonb(policy)
FROM public.ai_escalation_sla_policies policy
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_escalation_sla_policy_events event
  WHERE event.policy_id=policy.id AND event.event_type='created'
);

CREATE OR REPLACE FUNCTION public.staynas_seed_property_escalation_sla_policies()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  INSERT INTO public.ai_escalation_sla_policies
    (property_id,priority,acknowledgement_minutes,assignment_minutes,resolution_minutes)
  VALUES
    (NEW.id,1,15,10,120),
    (NEW.id,2,30,20,240),
    (NEW.id,3,60,30,480)
  ON CONFLICT (property_id,priority) DO NOTHING;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS staynas_property_seed_escalation_sla ON public.staynas_properties;
CREATE TRIGGER staynas_property_seed_escalation_sla
  AFTER INSERT ON public.staynas_properties
  FOR EACH ROW EXECUTE FUNCTION public.staynas_seed_property_escalation_sla_policies();

ALTER TABLE public.ai_escalations
  ADD COLUMN IF NOT EXISTS assignment_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledgement_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_cycle_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES public.ai_escalation_sla_policies(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.ai_escalation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  escalation_id uuid NOT NULL REFERENCES public.ai_escalations(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'created','assigned','reassigned','unassigned','acknowledged','in_progress',
    'resolved','reopened','dismissed','priority_changed',
    'assignment_approaching_breach','assignment_breached',
    'acknowledgement_approaching_breach','acknowledgement_breached',
    'resolution_approaching_breach','resolution_breached'
  )),
  from_status text,
  to_status text,
  from_assignee uuid,
  to_assignee uuid,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_escalations_sla_assignment_due_idx
  ON public.ai_escalations(assignment_due_at)
  WHERE status IN ('open','assigned','acknowledged','in_progress') AND assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS ai_escalations_sla_acknowledgement_due_idx
  ON public.ai_escalations(acknowledgement_due_at)
  WHERE status IN ('open','assigned','acknowledged','in_progress') AND acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS ai_escalations_sla_resolution_due_idx
  ON public.ai_escalations(resolution_due_at)
  WHERE status IN ('open','assigned','acknowledged','in_progress');

CREATE INDEX IF NOT EXISTS ai_escalation_events_property_time_idx
  ON public.ai_escalation_events(property_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_escalation_events_escalation_time_idx
  ON public.ai_escalation_events(escalation_id, occurred_at);

CREATE TABLE IF NOT EXISTS public.ai_escalation_sla_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  escalation_id uuid NOT NULL REFERENCES public.ai_escalations(id) ON DELETE RESTRICT,
  milestone text NOT NULL CHECK (milestone IN ('assignment','acknowledgement','resolution')),
  alert_type text NOT NULL CHECK (alert_type IN ('approaching_breach','breached')),
  due_at timestamptz NOT NULL,
  threshold_percent integer NOT NULL CHECK (threshold_percent BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(escalation_id,milestone,alert_type,due_at,threshold_percent)
);
CREATE INDEX IF NOT EXISTS ai_escalation_sla_alerts_property_time_idx
  ON public.ai_escalation_sla_alerts(property_id,created_at DESC);

ALTER TABLE public.ai_escalation_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_escalation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_escalation_sla_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_escalation_sla_policies, public.ai_escalation_events, public.ai_escalation_sla_alerts FROM PUBLIC, anon;
GRANT SELECT ON public.ai_escalation_sla_policies, public.ai_escalation_events, public.ai_escalation_sla_alerts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_escalation_sla_policies FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_escalation_sla_policies TO service_role;
GRANT SELECT, INSERT ON public.ai_escalation_events, public.ai_escalation_sla_alerts TO service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.ai_escalation_sla_policies, public.ai_escalation_events, public.ai_escalation_sla_alerts FROM PUBLIC, anon, authenticated, service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_escalation_events, public.ai_escalation_sla_alerts FROM anon, authenticated, service_role;
DROP POLICY IF EXISTS "Escalation SLA policies read in active property" ON public.ai_escalation_sla_policies;
CREATE POLICY "Escalation SLA policies read in active property"
  ON public.ai_escalation_sla_policies FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(property_id, ARRAY['owner','manager','admin','reservations']::public.app_role[]));
DROP POLICY IF EXISTS "Escalation events read in active property" ON public.ai_escalation_events;
CREATE POLICY "Escalation events read in active property"
  ON public.ai_escalation_events FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]));
DROP POLICY IF EXISTS "Escalation SLA alerts read in active property" ON public.ai_escalation_sla_alerts;
CREATE POLICY "Escalation SLA alerts read in active property"
  ON public.ai_escalation_sla_alerts FOR SELECT TO authenticated
  USING (public.staynas_ai_property_in_active_context(property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]));

-- Compute business-time minutes against a property-local weekly calendar.
-- Calendar shape: {"mon":[{"start":"09:00","end":"17:00"}],...,"sun":[...]}.
CREATE OR REPLACE FUNCTION public.staynas_sla_business_minutes(
  p_start timestamptz, p_end timestamptz, p_timezone text, p_hours jsonb
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_day date;
  v_key text;
  v_window jsonb;
  v_open timestamptz;
  v_close timestamptz;
  v_total numeric := 0;
  v_local_start timestamp;
  v_local_end timestamp;
BEGIN
  IF p_end <= p_start THEN RETURN 0; END IF;
  IF COALESCE(p_hours->>'mode','weekly') = '24x7' THEN
    RETURN EXTRACT(EPOCH FROM (p_end-p_start))/60;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'Invalid property timezone for SLA calendar';
  END IF;
  FOR v_day IN
    SELECT day_value::date FROM generate_series(
      (p_start AT TIME ZONE p_timezone)::date,
      (p_end AT TIME ZONE p_timezone)::date,
      interval '1 day'
    ) AS days(day_value)
  LOOP
    v_key := (ARRAY['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow FROM v_day)::integer];
    FOR v_window IN SELECT value FROM jsonb_array_elements(COALESCE(p_hours->v_key,'[]'::jsonb)) ORDER BY value->>'start'
    LOOP
      v_local_start := v_day + (v_window->>'start')::time;
      v_local_end := v_day + (v_window->>'end')::time;
      IF v_local_end <= v_local_start THEN RAISE EXCEPTION 'SLA calendar windows must end after they start'; END IF;
      v_open := v_local_start AT TIME ZONE p_timezone;
      v_close := v_local_end AT TIME ZONE p_timezone;
      v_total := v_total + GREATEST(0, EXTRACT(EPOCH FROM (LEAST(p_end,v_close)-GREATEST(p_start,v_open)))/60);
    END LOOP;
  END LOOP;
  RETURN v_total;
END
$function$;

CREATE OR REPLACE FUNCTION public.staynas_sla_add_minutes(
  p_start timestamptz, p_minutes integer, p_timezone text, p_hours jsonb
) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_day date;
  v_key text;
  v_window jsonb;
  v_open timestamptz;
  v_close timestamptz;
  v_available numeric;
  v_remaining numeric := p_minutes;
  v_result timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
BEGIN
  IF p_minutes <= 0 THEN RETURN p_start; END IF;
  IF COALESCE(p_hours->>'mode','weekly') = '24x7' THEN
    RETURN p_start + make_interval(mins => p_minutes);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'Invalid property timezone for SLA calendar';
  END IF;
  FOR v_day IN SELECT day_value::date FROM generate_series(
    (p_start AT TIME ZONE p_timezone)::date,
    (p_start AT TIME ZONE p_timezone)::date + 3700,
    interval '1 day'
  ) AS days(day_value)
  LOOP
    v_key := (ARRAY['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow FROM v_day)::integer];
    FOR v_window IN SELECT value FROM jsonb_array_elements(COALESCE(p_hours->v_key,'[]'::jsonb)) ORDER BY value->>'start'
    LOOP
      v_local_start := v_day + (v_window->>'start')::time;
      v_local_end := v_day + (v_window->>'end')::time;
      IF v_local_end <= v_local_start THEN RAISE EXCEPTION 'SLA calendar windows must end after they start'; END IF;
      v_open := v_local_start AT TIME ZONE p_timezone;
      v_close := v_local_end AT TIME ZONE p_timezone;
      v_result := GREATEST(p_start,v_open);
      v_available := GREATEST(0,EXTRACT(EPOCH FROM (v_close-v_result))/60);
      IF v_available > 0 THEN
        IF v_remaining <= v_available THEN
          RETURN v_result + make_interval(secs => (v_remaining*60)::double precision);
        END IF;
        v_remaining := v_remaining-v_available;
      END IF;
    END LOOP;
  END LOOP;
  RAISE EXCEPTION 'SLA calendar has insufficient operating windows within ten years';
END
$function$;

CREATE OR REPLACE FUNCTION public.staynas_set_concierge_escalation_deadlines()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_policy public.ai_escalation_sla_policies%ROWTYPE;
  v_reason_map jsonb;
  v_mapped_priority smallint;
  v_timezone text;
  v_now timestamptz := COALESCE(NEW.created_at,now());
BEGIN
  SELECT reason_priority_map INTO v_reason_map FROM public.ai_escalation_sla_policies
  WHERE property_id=NEW.property_id AND enabled ORDER BY priority LIMIT 1;
  IF v_reason_map ? NEW.reason THEN
    v_mapped_priority := (v_reason_map->>NEW.reason)::smallint;
    IF v_mapped_priority BETWEEN 1 AND 3 AND EXISTS (
      SELECT 1 FROM public.ai_escalation_sla_policies
      WHERE property_id=NEW.property_id AND priority=v_mapped_priority AND enabled
    ) THEN NEW.priority := v_mapped_priority; END IF;
  END IF;
  SELECT * INTO v_policy FROM public.ai_escalation_sla_policies
  WHERE property_id=NEW.property_id AND priority=NEW.priority AND enabled=true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enabled SLA policy missing for property and escalation priority';
  END IF;
  SELECT COALESCE(timezone,'UTC') INTO v_timezone FROM public.staynas_properties WHERE id=NEW.property_id;
  NEW.sla_policy_id := v_policy.id;
  NEW.sla_cycle_started_at := v_now;
  NEW.assignment_due_at := CASE WHEN v_policy.business_hours_only
    THEN public.staynas_sla_add_minutes(v_now,v_policy.assignment_minutes,v_timezone,v_policy.operating_hours)
    ELSE v_now+make_interval(mins=>v_policy.assignment_minutes) END;
  NEW.acknowledgement_due_at := CASE WHEN v_policy.business_hours_only
    THEN public.staynas_sla_add_minutes(v_now,v_policy.acknowledgement_minutes,v_timezone,v_policy.operating_hours)
    ELSE v_now+make_interval(mins=>v_policy.acknowledgement_minutes) END;
  NEW.resolution_due_at := CASE WHEN v_policy.business_hours_only
    THEN public.staynas_sla_add_minutes(v_now,v_policy.resolution_minutes,v_timezone,v_policy.operating_hours)
    ELSE v_now+make_interval(mins=>v_policy.resolution_minutes) END;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS ai_escalations_set_sla_deadlines ON public.ai_escalations;
CREATE TRIGGER ai_escalations_set_sla_deadlines
  BEFORE INSERT ON public.ai_escalations
  FOR EACH ROW EXECUTE FUNCTION public.staynas_set_concierge_escalation_deadlines();

CREATE OR REPLACE FUNCTION public.staynas_record_concierge_escalation_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_event text;
  v_actor uuid := auth.uid();
  v_event_id uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    v_event := 'created';
    INSERT INTO public.ai_escalation_events(property_id,escalation_id,event_type,metadata,occurred_at)
    VALUES (NEW.property_id,NEW.id,'created',jsonb_build_object('priority',NEW.priority,'assignment_due_at',NEW.assignment_due_at,'acknowledgement_due_at',NEW.acknowledgement_due_at,'resolution_due_at',NEW.resolution_due_at,'sla_cycle_started_at',NEW.sla_cycle_started_at),NEW.created_at);
  ELSE
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      v_event := CASE WHEN NEW.assigned_to IS NULL THEN 'unassigned' WHEN OLD.assigned_to IS NULL THEN 'assigned' ELSE 'reassigned' END;
      INSERT INTO public.ai_escalation_events(property_id,escalation_id,event_type,from_status,to_status,from_assignee,to_assignee,actor_id,metadata)
      VALUES (NEW.property_id,NEW.id,v_event,OLD.status,NEW.status,OLD.assigned_to,NEW.assigned_to,v_actor,jsonb_build_object('assignment_due_at',NEW.assignment_due_at,'acknowledgement_due_at',NEW.acknowledgement_due_at,'resolution_due_at',NEW.resolution_due_at,'priority',NEW.priority,'sla_cycle_started_at',NEW.sla_cycle_started_at));
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_event := CASE
        WHEN NEW.status='resolved' THEN 'resolved'
        WHEN NEW.status='dismissed' THEN 'dismissed'
        WHEN NEW.status='acknowledged' THEN 'acknowledged'
        WHEN NEW.status='in_progress' THEN 'in_progress'
        WHEN NEW.status='open' AND OLD.status IN ('resolved','dismissed') THEN 'reopened'
        WHEN NEW.status='acknowledged' THEN 'acknowledged'
        ELSE NULL END;
      IF v_event IS NOT NULL THEN
        INSERT INTO public.ai_escalation_events(property_id,escalation_id,event_type,from_status,to_status,actor_id,metadata)
        VALUES (NEW.property_id,NEW.id,v_event,OLD.status,NEW.status,v_actor,jsonb_build_object('assignment_due_at',NEW.assignment_due_at,'acknowledgement_due_at',NEW.acknowledgement_due_at,'resolution_due_at',NEW.resolution_due_at,'priority',NEW.priority,'reopened_at',NEW.reopened_at,'sla_cycle_started_at',NEW.sla_cycle_started_at,'resolution_notes',NEW.resolution_notes));
      END IF;
    END IF;
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO public.ai_escalation_events(property_id,escalation_id,event_type,metadata,actor_id)
      VALUES (NEW.property_id,NEW.id,'priority_changed',jsonb_build_object('from',OLD.priority,'to',NEW.priority),v_actor)
      RETURNING id INTO v_event_id;
      PERFORM public.staynas_set_concierge_escalation_deadlines_for_row(NEW.id);
      UPDATE public.ai_escalation_events event SET metadata=event.metadata || jsonb_build_object(
        'assignment_due_at',escalation.assignment_due_at,
        'acknowledgement_due_at',escalation.acknowledgement_due_at,
        'resolution_due_at',escalation.resolution_due_at,
        'sla_policy_id',escalation.sla_policy_id
      ) FROM public.ai_escalations escalation WHERE event.id=v_event_id AND escalation.id=NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

-- Recalculate the deadlines from the new priority while preserving original created_at.
CREATE OR REPLACE FUNCTION public.staynas_set_concierge_escalation_deadlines_for_row(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  e public.ai_escalations%ROWTYPE;
  p public.ai_escalation_sla_policies%ROWTYPE;
  tz text;
BEGIN
  SELECT * INTO e FROM public.ai_escalations WHERE id=p_id;
  SELECT * INTO p FROM public.ai_escalation_sla_policies WHERE property_id=e.property_id AND priority=e.priority AND enabled;
  SELECT COALESCE(timezone,'UTC') INTO tz FROM public.staynas_properties WHERE id=e.property_id;
  IF p.id IS NOT NULL THEN
    UPDATE public.ai_escalations SET
      sla_policy_id=p.id,
      assignment_due_at=CASE WHEN p.business_hours_only THEN public.staynas_sla_add_minutes(COALESCE(e.sla_cycle_started_at,e.created_at),p.assignment_minutes,tz,p.operating_hours) ELSE COALESCE(e.sla_cycle_started_at,e.created_at)+make_interval(mins=>p.assignment_minutes) END,
      acknowledgement_due_at=CASE WHEN p.business_hours_only THEN public.staynas_sla_add_minutes(COALESCE(e.sla_cycle_started_at,e.created_at),p.acknowledgement_minutes,tz,p.operating_hours) ELSE COALESCE(e.sla_cycle_started_at,e.created_at)+make_interval(mins=>p.acknowledgement_minutes) END,
      resolution_due_at=CASE WHEN p.business_hours_only THEN public.staynas_sla_add_minutes(COALESCE(e.sla_cycle_started_at,e.created_at),p.resolution_minutes,tz,p.operating_hours) ELSE COALESCE(e.sla_cycle_started_at,e.created_at)+make_interval(mins=>p.resolution_minutes) END
    WHERE id=p_id;
  END IF;
END
$function$;

-- Backfill deadlines for existing escalations and recalculate active deadlines
-- whenever a property manager changes its policy.
DO $backfill_sla$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.ai_escalations LOOP
    PERFORM public.staynas_set_concierge_escalation_deadlines_for_row(r.id);
  END LOOP;
END
$backfill_sla$;

CREATE OR REPLACE FUNCTION public.staynas_refresh_property_sla_deadlines()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE r record;
BEGIN
  IF NOT NEW.enabled AND EXISTS (
    SELECT 1 FROM public.ai_escalations
    WHERE sla_policy_id=OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot disable an SLA policy while any escalation references it';
  END IF;
  FOR r IN SELECT id FROM public.ai_escalations
    WHERE property_id=NEW.property_id AND priority=NEW.priority
      AND status IN ('open','assigned','acknowledged','in_progress')
  LOOP
    PERFORM public.staynas_set_concierge_escalation_deadlines_for_row(r.id);
  END LOOP;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS ai_escalation_sla_policy_refresh ON public.ai_escalation_sla_policies;
CREATE TRIGGER ai_escalation_sla_policy_refresh
  AFTER UPDATE OF enabled,acknowledgement_minutes,assignment_minutes,resolution_minutes,business_hours_only,operating_hours,warning_percent
  ON public.ai_escalation_sla_policies
  FOR EACH ROW EXECUTE FUNCTION public.staynas_refresh_property_sla_deadlines();

DROP TRIGGER IF EXISTS ai_escalations_record_lifecycle_event ON public.ai_escalations;
CREATE TRIGGER ai_escalations_record_lifecycle_event
  AFTER INSERT OR UPDATE OF status,assigned_to,priority ON public.ai_escalations
  FOR EACH ROW EXECUTE FUNCTION public.staynas_record_concierge_escalation_event();

-- Seed one auditable creation event for each pre-existing escalation.
INSERT INTO public.ai_escalation_events(property_id,escalation_id,event_type,metadata,occurred_at)
SELECT e.property_id,e.id,'created',jsonb_build_object('source','SN-OC-04 migration baseline'),e.created_at
FROM public.ai_escalations e
WHERE NOT EXISTS (SELECT 1 FROM public.ai_escalation_events h WHERE h.escalation_id=e.id AND h.event_type='created');

-- SLA alert worker is idempotent and sends only to active property staff via in-app.
CREATE OR REPLACE FUNCTION public.staynas_process_concierge_sla_alerts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  e record;
  a record;
  v_alert_id uuid;
  v_count integer := 0;
  v_warning_at timestamptz;
  v_timezone text;
  v_hours jsonb;
  v_target_minutes integer;
BEGIN
  FOR e IN
    SELECT escalation.*, policy.warning_percent
    FROM public.ai_escalations escalation
    JOIN public.ai_escalation_sla_policies policy
      ON policy.id=escalation.sla_policy_id AND policy.enabled
    WHERE escalation.status IN ('open','assigned','acknowledged','in_progress')
  LOOP
    v_alert_id := NULL;
    BEGIN
    SELECT property.timezone, policy.operating_hours INTO v_timezone,v_hours
    FROM public.staynas_properties property
    JOIN public.ai_escalation_sla_policies policy ON policy.id=e.sla_policy_id
    WHERE property.id=e.property_id;
    FOR a IN
      SELECT 'assignment'::text AS milestone, e.assignment_due_at AS due_at,
        (e.assigned_to IS NULL) AS pending, policy.assignment_minutes AS target_minutes
      FROM public.ai_escalation_sla_policies policy WHERE policy.id=e.sla_policy_id
      UNION ALL
      SELECT 'acknowledgement', e.acknowledgement_due_at, (e.acknowledged_at IS NULL), policy.acknowledgement_minutes
      FROM public.ai_escalation_sla_policies policy WHERE policy.id=e.sla_policy_id
      UNION ALL
      SELECT 'resolution', e.resolution_due_at, true, policy.resolution_minutes
      FROM public.ai_escalation_sla_policies policy WHERE policy.id=e.sla_policy_id
    LOOP
      v_alert_id := NULL;
      IF NOT a.pending OR a.due_at IS NULL THEN CONTINUE; END IF;
      SELECT CASE WHEN policy.business_hours_only
        THEN public.staynas_sla_add_minutes(COALESCE(e.sla_cycle_started_at,e.created_at),GREATEST(1,round(a.target_minutes*e.warning_percent/100.0)::integer),v_timezone,v_hours)
        ELSE COALESCE(e.sla_cycle_started_at,e.created_at)+make_interval(mins=>GREATEST(1,round(a.target_minutes*e.warning_percent/100.0)::integer)) END
      INTO v_warning_at
      FROM public.ai_escalation_sla_policies policy WHERE policy.id=e.sla_policy_id;
      IF now() >= a.due_at THEN
        INSERT INTO public.ai_escalation_sla_alerts(property_id,escalation_id,milestone,alert_type,due_at,threshold_percent)
        VALUES (e.property_id,e.id,a.milestone,'breached',a.due_at,e.warning_percent)
        ON CONFLICT DO NOTHING RETURNING id INTO v_alert_id;
      ELSIF now() >= v_warning_at THEN
        INSERT INTO public.ai_escalation_sla_alerts(property_id,escalation_id,milestone,alert_type,due_at,threshold_percent)
        VALUES (e.property_id,e.id,a.milestone,'approaching_breach',a.due_at,e.warning_percent)
        ON CONFLICT DO NOTHING RETURNING id INTO v_alert_id;
      ELSE
        v_alert_id := NULL;
      END IF;
      IF v_alert_id IS NOT NULL THEN
        INSERT INTO public.ai_escalation_events(property_id,escalation_id,event_type,metadata)
        VALUES (e.property_id,e.id,
          CASE a.milestone
            WHEN 'assignment' THEN CASE WHEN now() >= a.due_at THEN 'assignment_breached' ELSE 'assignment_approaching_breach' END
            WHEN 'acknowledgement' THEN CASE WHEN now() >= a.due_at THEN 'acknowledgement_breached' ELSE 'acknowledgement_approaching_breach' END
            ELSE CASE WHEN now() >= a.due_at THEN 'resolution_breached' ELSE 'resolution_approaching_breach' END
          END,
          jsonb_build_object('alert_id',v_alert_id,'due_at',a.due_at,'warning_percent',e.warning_percent));
        INSERT INTO public.notifications(user_id,channel,title,body,href,kind,meta)
        SELECT member.user_id,'in_app',
          CASE WHEN now() >= a.due_at THEN 'Concierge SLA breached' ELSE 'Concierge SLA approaching' END,
          format('Priority %s escalation %s: %s SLA %s.',e.priority,e.id,a.milestone,CASE WHEN now() >= a.due_at THEN 'breached' ELSE 'approaching breach' END),
          '/admin/ai/concierge/escalations','concierge_sla',
          jsonb_build_object('property_id',e.property_id,'escalation_id',e.id,'alert_id',v_alert_id,'milestone',a.milestone,'alert_type',CASE WHEN now() >= a.due_at THEN 'breached' ELSE 'approaching_breach' END,'due_at',a.due_at)
        FROM public.staynas_property_members member
        WHERE member.property_id=e.property_id AND member.status='active'
          AND member.role::text IN ('owner','manager','admin','reservations','reception')
          AND (e.assigned_to IS NULL OR member.user_id=e.assigned_to OR member.role::text IN ('owner','manager','admin'));
        v_count := v_count+1;
      END IF;
      v_alert_id := NULL;
    END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Concierge SLA monitor skipped escalation % for property %: %',e.id,e.property_id,SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END
$function$;

REVOKE ALL ON FUNCTION public.staynas_process_concierge_sla_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_process_concierge_sla_alerts() TO service_role;

-- Extend the existing atomic transition RPC with explicit reopen support.
DROP FUNCTION IF EXISTS public.staynas_transition_concierge_escalation(uuid,uuid,text,uuid,text);
CREATE OR REPLACE FUNCTION public.staynas_transition_concierge_escalation(
  p_escalation_id uuid,p_property_id uuid,p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,p_resolution_notes text DEFAULT NULL,p_priority smallint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_escalation public.ai_escalations%ROWTYPE;
  v_next_status text;
  v_message text;
  v_message_id uuid;
  v_web_enabled boolean;
  v_updated_rows integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.staynas_ai_property_in_active_context(
    p_property_id,ARRAY['owner','manager','admin','reservations']::public.app_role[]
  ) THEN RAISE EXCEPTION 'Active property authorization is required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open','assigned','acknowledged','in_progress','resolved','dismissed') THEN
    RAISE EXCEPTION 'Invalid escalation status' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_escalation FROM public.ai_escalations
  WHERE id=p_escalation_id AND property_id=p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escalation not found in active property' USING ERRCODE='P0002'; END IF;
  IF p_priority IS NOT NULL AND (p_priority NOT BETWEEN 1 AND 3 OR NOT EXISTS (
    SELECT 1 FROM public.ai_escalation_sla_policies WHERE property_id=p_property_id AND priority=p_priority AND enabled
  )) THEN RAISE EXCEPTION 'Selected priority has no enabled SLA policy' USING ERRCODE='23514'; END IF;
  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members m WHERE m.property_id=p_property_id
      AND m.user_id=p_assigned_to AND m.status='active'
      AND m.role::text IN ('owner','manager','admin','reservations','reception')
  ) THEN RAISE EXCEPTION 'Assignee must be an active member of the property' USING ERRCODE='42501'; END IF;

  IF v_escalation.status IN ('resolved','dismissed') AND p_status IS NOT NULL
     AND p_status NOT IN ('open',v_escalation.status) THEN
    RAISE EXCEPTION 'Closed escalations may only be reopened to open' USING ERRCODE='23514';
  END IF;
  IF v_escalation.status='acknowledged' AND p_status='assigned'
     OR v_escalation.status='in_progress' AND p_status IN ('assigned','acknowledged') THEN
    RAISE EXCEPTION 'Escalation status cannot move backwards' USING ERRCODE='23514';
  END IF;
  IF p_status='acknowledged' AND v_escalation.status<>'assigned' THEN
    RAISE EXCEPTION 'Only an assigned escalation can be acknowledged' USING ERRCODE='23514';
  END IF;
  IF p_status='in_progress' AND v_escalation.status<>'acknowledged' THEN
    RAISE EXCEPTION 'An escalation must be acknowledged before work starts' USING ERRCODE='23514';
  END IF;
  IF p_status='resolved' AND v_escalation.status<>'in_progress' THEN
    RAISE EXCEPTION 'An escalation must be in progress before resolution' USING ERRCODE='23514';
  END IF;
  IF p_status='assigned' AND v_escalation.status NOT IN ('open','assigned') THEN
    RAISE EXCEPTION 'Only an open escalation can be assigned or reassigned' USING ERRCODE='23514';
  END IF;

  v_next_status := coalesce(p_status,
    CASE WHEN p_assigned_to IS NOT NULL AND v_escalation.status='open' THEN 'assigned' ELSE v_escalation.status END);
  IF v_next_status IN ('assigned','acknowledged') AND COALESCE(p_assigned_to,v_escalation.assigned_to) IS NULL THEN
    RAISE EXCEPTION 'Assignment is required before acknowledgement' USING ERRCODE='23514';
  END IF;

  UPDATE public.ai_escalations AS escalation SET
    status=v_next_status,
    priority=COALESCE(p_priority,escalation.priority),
    sla_policy_id=policy.id,
    assigned_to=CASE WHEN p_assigned_to IS NOT NULL THEN p_assigned_to
      WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN NULL
      ELSE assigned_to END,
    resolution_notes=CASE WHEN p_resolution_notes IS NOT NULL THEN left(p_resolution_notes,2000) ELSE resolution_notes END,
    acknowledged_at=CASE WHEN v_next_status IN ('acknowledged','in_progress') THEN COALESCE(acknowledged_at,now())
      WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN NULL ELSE acknowledged_at END,
    acknowledged_by=CASE WHEN v_next_status IN ('acknowledged','in_progress') THEN COALESCE(acknowledged_by,auth.uid())
      WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN NULL ELSE acknowledged_by END,
    resolved_at=CASE WHEN v_next_status IN ('resolved','dismissed') THEN now()
      WHEN v_next_status='open' AND v_escalation.status IN ('resolved','dismissed') THEN NULL ELSE resolved_at END,
    reopened_at=CASE WHEN v_next_status='open' AND v_escalation.status IN ('resolved','dismissed') THEN now() ELSE reopened_at END,
    sla_cycle_started_at=CASE WHEN v_next_status='open' AND v_escalation.status<>'open' THEN now() ELSE sla_cycle_started_at END,
    assignment_due_at=CASE WHEN v_next_status='open' AND v_escalation.status<>'open' THEN
      CASE WHEN policy.business_hours_only THEN public.staynas_sla_add_minutes(now(),policy.assignment_minutes,COALESCE(property.timezone,'UTC'),policy.operating_hours) ELSE now()+make_interval(mins=>policy.assignment_minutes) END ELSE assignment_due_at END,
    acknowledgement_due_at=CASE WHEN v_next_status='open' AND v_escalation.status<>'open' THEN
      CASE WHEN policy.business_hours_only THEN public.staynas_sla_add_minutes(now(),policy.acknowledgement_minutes,COALESCE(property.timezone,'UTC'),policy.operating_hours) ELSE now()+make_interval(mins=>policy.acknowledgement_minutes) END ELSE acknowledgement_due_at END,
    resolution_due_at=CASE WHEN v_next_status='open' AND v_escalation.status<>'open' THEN
      CASE WHEN policy.business_hours_only THEN public.staynas_sla_add_minutes(now(),policy.resolution_minutes,COALESCE(property.timezone,'UTC'),policy.operating_hours) ELSE now()+make_interval(mins=>policy.resolution_minutes) END ELSE resolution_due_at END,
    updated_at=now()
  FROM public.ai_escalation_sla_policies policy
  JOIN public.staynas_properties property ON property.id=policy.property_id
  WHERE escalation.id=p_escalation_id AND escalation.property_id=p_property_id
    AND policy.property_id=p_property_id AND policy.priority=COALESCE(p_priority,v_escalation.priority) AND policy.enabled;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN RAISE EXCEPTION 'No enabled property SLA policy exists for this escalation priority' USING ERRCODE='23514'; END IF;

  IF v_escalation.ops_task_id IS NOT NULL THEN
    UPDATE public.ops_tasks SET
      assigned_to=CASE WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN NULL
        WHEN p_assigned_to IS NOT NULL THEN p_assigned_to ELSE assigned_to END,
      status=CASE WHEN v_next_status='in_progress' THEN 'in_progress'::public.ops_task_status
        WHEN v_next_status='resolved' THEN 'completed'::public.ops_task_status
        WHEN v_next_status='dismissed' THEN 'cancelled'::public.ops_task_status
        WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN 'pending'::public.ops_task_status
        ELSE status END,
      completed_at=CASE WHEN v_next_status='resolved' THEN now()
        WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN NULL ELSE completed_at END,
      completed_by=CASE WHEN v_next_status='open' AND v_escalation.status IN ('assigned','acknowledged','in_progress','resolved','dismissed') THEN NULL
        WHEN v_next_status='resolved' THEN auth.uid() ELSE completed_by END,
      updated_at=now()
    WHERE id=v_escalation.ops_task_id AND property_id=p_property_id;
  END IF;

  IF v_next_status IN ('assigned','in_progress','resolved','dismissed')
     AND NOT EXISTS (SELECT 1 FROM public.ai_escalation_guest_notifications n
       WHERE n.escalation_id=p_escalation_id AND n.status=v_next_status AND n.channel='web') THEN
    SELECT EXISTS (SELECT 1 FROM public.ai_concierge_channels
      WHERE channel='web' AND status='active' AND outbound_enabled=true) INTO v_web_enabled;
    IF v_web_enabled THEN
      v_message := CASE v_next_status
        WHEN 'assigned' THEN 'The property team has received your request and is arranging assistance.'
        WHEN 'in_progress' THEN 'A member of the property team is now working on your request.'
        WHEN 'resolved' THEN 'The property team has marked your request as resolved. Send another message if you still need help.'
        ELSE 'The property team has closed this request. Send another message if you still need assistance.' END;
      INSERT INTO public.ai_concierge_messages(session_id,role,content,confidence,escalated,model)
      VALUES (v_escalation.session_id,'assistant',v_message,1.0,false,'staynas-concierge-handoff')
      RETURNING id INTO v_message_id;
      INSERT INTO public.ai_escalation_guest_notifications(property_id,escalation_id,session_id,status,channel,delivery_status,message_id,delivered_at)
      VALUES (p_property_id,p_escalation_id,v_escalation.session_id,v_next_status,'web','sent',v_message_id,now());
    ELSE
      INSERT INTO public.ai_escalation_guest_notifications(property_id,escalation_id,session_id,status,channel,delivery_status)
      VALUES (p_property_id,p_escalation_id,v_escalation.session_id,v_next_status,'web','not_configured');
    END IF;
  END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.staynas_transition_concierge_escalation(uuid,uuid,text,uuid,text,smallint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staynas_transition_concierge_escalation(uuid,uuid,text,uuid,text,smallint) TO authenticated,service_role;

-- Invoke the alert processor every minute through Supabase pg_cron. The job is
-- idempotent and does not depend on Vercel Cron or a Vercel deployment.
DO $cron$
DECLARE v_job record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='staynas-concierge-sla-monitor'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;
    PERFORM cron.schedule('staynas-concierge-sla-monitor','* * * * *',
      'SELECT public.staynas_process_concierge_sla_alerts();');
  END IF;
END
$cron$;

REVOKE ALL ON FUNCTION public.staynas_set_concierge_escalation_deadlines_for_row(uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
