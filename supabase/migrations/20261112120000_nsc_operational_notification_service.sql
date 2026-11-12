-- NSC-03/04: property-scoped operational notification service.
-- Guest booking/request communications and commercial-founder notifications remain separate.
BEGIN;

CREATE SCHEMA IF NOT EXISTS nsc_private;
REVOKE ALL ON SCHEMA nsc_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA nsc_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA nsc_private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.operational_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 2 AND 80),
  source_event_id uuid,
  dedupe_key text NOT NULL CHECK (length(btrim(dedupe_key)) BETWEEN 8 AND 300),
  event_type text NOT NULL CHECK (length(btrim(event_type)) BETWEEN 2 AND 100),
  module text NOT NULL CHECK (length(btrim(module)) BETWEEN 2 AND 80),
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) BETWEEN 2 AND 80),
  entity_id uuid,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  body text,
  href text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  correlation_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, dedupe_key),
  UNIQUE (id, property_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS operational_notification_events_property_created_idx
  ON public.operational_notification_events(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_notification_events_open_idx
  ON public.operational_notification_events(property_id, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.operational_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','push')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','suppressed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,
  provider_message_ref text,
  read_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level >= 0),
  escalated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, property_id, organisation_id)
    REFERENCES public.operational_notification_events(id, property_id, organisation_id)
    ON DELETE CASCADE,
  UNIQUE (event_id, recipient_user_id, channel)
);

CREATE INDEX IF NOT EXISTS operational_notification_deliveries_recipient_idx
  ON public.operational_notification_deliveries(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_notification_deliveries_pending_idx
  ON public.operational_notification_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('pending','failed');

CREATE TABLE IF NOT EXISTS public.operational_notification_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.operational_notification_events(id) ON DELETE RESTRICT,
  delivery_id uuid REFERENCES public.operational_notification_deliveries(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created','delivery_attempted','delivered','failed','read','acknowledged','escalated','resolved')),
  from_state text,
  to_state text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_notification_audit_event_idx
  ON public.operational_notification_audit(event_id, occurred_at DESC);
GRANT USAGE, SELECT ON SEQUENCE public.operational_notification_audit_id_seq TO service_role;

ALTER TABLE public.operational_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_notification_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'operational_notification_deliveries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_notification_deliveries;
  END IF;
END $$;

REVOKE ALL ON public.operational_notification_events FROM anon, authenticated;
REVOKE ALL ON public.operational_notification_deliveries FROM anon, authenticated;
REVOKE ALL ON public.operational_notification_audit FROM anon, authenticated;
GRANT SELECT ON public.operational_notification_events, public.operational_notification_deliveries, public.operational_notification_audit TO authenticated;
GRANT ALL ON public.operational_notification_events, public.operational_notification_deliveries, public.operational_notification_audit TO service_role;

CREATE POLICY operational_notification_events_recipient_read
  ON public.operational_notification_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operational_notification_deliveries d
      WHERE d.event_id = operational_notification_events.id
        AND d.property_id = operational_notification_events.property_id
        AND d.recipient_user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id = operational_notification_events.property_id
        AND pm.user_id = (select auth.uid())
        AND pm.status = 'active'
        AND pm.role = ANY(ARRAY['owner','manager','admin']::public.app_role[])
    )
  );

CREATE POLICY operational_notification_deliveries_recipient_read
  ON public.operational_notification_deliveries FOR SELECT TO authenticated
  USING (
    recipient_user_id = (select auth.uid())
    AND public.staynas_user_has_property_access((select auth.uid()), property_id)
  );

CREATE POLICY operational_notification_audit_property_read
  ON public.operational_notification_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.operational_notification_events e
      JOIN public.staynas_property_members pm ON pm.property_id = e.property_id
      WHERE e.id = operational_notification_audit.event_id
        AND pm.user_id = (select auth.uid())
        AND pm.status = 'active'
        AND pm.role = ANY(ARRAY['owner','manager','admin']::public.app_role[])
    )
  );

-- Server/trigger-only event ingress. The property determines its organisation;
-- callers cannot submit a mismatched tenant id or arbitrary recipient user.
CREATE OR REPLACE FUNCTION nsc_private.staynas_publish_operational_notification(
  _property_id uuid,
  _source text,
  _dedupe_key text,
  _event_type text,
  _module text,
  _entity_type text,
  _entity_id uuid,
  _actor_user_id uuid,
  _assignee_user_id uuid,
  _reporter_user_id uuid,
  _recipient_roles public.app_role[],
  _severity text,
  _title text,
  _body text,
  _href text,
  _payload jsonb,
  _correlation_id uuid,
  _occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_organisation_id uuid;
  v_event_id uuid;
  v_recipient uuid;
  v_delivery_id uuid;
  v_is_new boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND _source <> 'integrations.lexibite.inventory' AND (
    _actor_user_id IS DISTINCT FROM auth.uid()
    OR NOT EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id = _property_id
        AND pm.user_id = auth.uid()
        AND pm.status = 'active'
        AND pm.role <> 'user'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'Operational notification property access denied';
  END IF;
  IF _property_id IS NULL OR _dedupe_key IS NULL OR _event_type IS NULL THEN
    RAISE EXCEPTION 'Property, dedupe key and event type are required';
  END IF;
  IF _severity NOT IN ('info','warning','critical') THEN
    RAISE EXCEPTION 'Invalid operational notification severity';
  END IF;

  SELECT p.organisation_id INTO v_organisation_id
  FROM public.staynas_properties p
  WHERE p.id = _property_id AND p.status = 'active';
  IF v_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Active property not found';
  END IF;

  INSERT INTO public.operational_notification_events(
    organisation_id, property_id, source, dedupe_key, event_type, module,
    entity_type, entity_id, actor_user_id, severity, title, body, href,
    payload, correlation_id, occurred_at
  )
  VALUES(
    v_organisation_id, _property_id, _source, _dedupe_key, _event_type, _module,
    _entity_type, _entity_id, _actor_user_id, _severity, _title, _body, _href,
    COALESCE(_payload, '{}'::jsonb), _correlation_id, COALESCE(_occurred_at, now())
  )
  ON CONFLICT (property_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_event_id;
  v_is_new := v_event_id IS NOT NULL;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM public.operational_notification_events
    WHERE property_id = _property_id AND dedupe_key = _dedupe_key;
    IF v_event_id IS NULL THEN RAISE EXCEPTION 'Operational event idempotency lookup failed'; END IF;
  END IF;

  IF v_is_new THEN
    INSERT INTO public.operational_notification_audit(event_id, actor_user_id, action, to_state)
    VALUES(v_event_id, _actor_user_id, 'created', 'pending');
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT pm.user_id
    FROM public.staynas_property_members pm
    WHERE pm.property_id = _property_id
      AND pm.status = 'active'
      AND (
        pm.role = ANY(COALESCE(_recipient_roles, ARRAY[]::public.app_role[]))
        OR pm.user_id = _assignee_user_id
        OR pm.user_id = _reporter_user_id
      )
  LOOP
    v_delivery_id := NULL;
    INSERT INTO public.operational_notification_deliveries(
      event_id, organisation_id, property_id, recipient_user_id, assigned_at, assigned_by, channel, status, attempt_count
    )
    VALUES(v_event_id, v_organisation_id, _property_id, v_recipient, now(), _actor_user_id, 'in_app', 'delivered', 1)
    ON CONFLICT (event_id, recipient_user_id, channel) DO NOTHING
    RETURNING id INTO v_delivery_id;
    IF v_delivery_id IS NOT NULL THEN
      INSERT INTO public.operational_notification_audit(
        event_id, delivery_id, actor_user_id, action, from_state, to_state,
        metadata
      )
      VALUES(v_event_id, v_delivery_id, _actor_user_id, 'delivered', 'pending', 'delivered',
        jsonb_build_object('channel','in_app','recipient_user_id',v_recipient));
    END IF;
  END LOOP;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION nsc_private.staynas_publish_operational_notification(
  uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,public.app_role[],text,text,text,text,jsonb,uuid,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nsc_private.staynas_publish_operational_notification(
  uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,public.app_role[],text,text,text,text,jsonb,uuid,timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION nsc_private.staynas_publish_operational_notification_rpc(
  _property_id uuid, _source text, _dedupe_key text, _event_type text,
  _module text, _entity_type text, _entity_id uuid, _actor_user_id uuid,
  _assignee_user_id uuid, _reporter_user_id uuid, _recipient_roles public.app_role[],
  _severity text, _title text, _body text, _href text, _payload jsonb,
  _correlation_id uuid, _occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, nsc_private
AS $nsc$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _actor_user_id IS DISTINCT FROM auth.uid()
       OR _source NOT IN ('automation.workflow','intelligence') THEN
      RAISE EXCEPTION 'Operational notification source is not authorized';
    END IF;
    IF (_source = 'automation.workflow' AND _module <> 'automation')
       OR (_source = 'intelligence' AND _module NOT IN ('booking','pms','operations','guest','revenue','marketing','platform')) THEN
      RAISE EXCEPTION 'Operational notification module is not authorized';
    END IF;
  END IF;
  RETURN nsc_private.staynas_publish_operational_notification(
    _property_id,_source,_dedupe_key,_event_type,_module,_entity_type,_entity_id,
    _actor_user_id,_assignee_user_id,_reporter_user_id,_recipient_roles,_severity,
    _title,_body,_href,_payload,_correlation_id,_occurred_at
  );
END;
$nsc$;
REVOKE ALL ON FUNCTION nsc_private.staynas_publish_operational_notification_rpc(
  uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,public.app_role[],text,text,text,text,jsonb,uuid,timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nsc_private.staynas_publish_operational_notification_rpc(
  uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,public.app_role[],text,text,text,text,jsonb,uuid,timestamptz
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staynas_publish_operational_notification(
  _property_id uuid, _source text, _dedupe_key text, _event_type text,
  _module text, _entity_type text, _entity_id uuid, _actor_user_id uuid,
  _assignee_user_id uuid, _reporter_user_id uuid, _recipient_roles public.app_role[],
  _severity text, _title text, _body text, _href text, _payload jsonb,
  _correlation_id uuid, _occurred_at timestamptz
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, nsc_private
AS $nsc$
  SELECT nsc_private.staynas_publish_operational_notification_rpc(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
  )
$nsc$;
REVOKE ALL ON FUNCTION public.staynas_publish_operational_notification(
  uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,public.app_role[],text,text,text,text,jsonb,uuid,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_publish_operational_notification(
  uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,public.app_role[],text,text,text,text,jsonb,uuid,timestamptz
) TO service_role, authenticated;

-- Housekeeping events are already the durable source of truth. Mirror each event
-- once into the operational service, resolving recipients from this event's property.
CREATE OR REPLACE FUNCTION nsc_private.staynas_resolve_entity_notifications(
  _property_id uuid,
  _entity_type text,
  _entity_id uuid,
  _event_types text[],
  _actor_user_id uuid,
  _reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_count integer := 0;
BEGIN
  WITH changed AS (
    UPDATE public.operational_notification_deliveries d
    SET read_at = COALESCE(d.read_at, now()),
        acknowledged_at = COALESCE(d.acknowledged_at, now()),
        resolved_at = COALESCE(d.resolved_at, now()),
        updated_at = now()
    FROM public.operational_notification_events e
    WHERE e.id = d.event_id
      AND e.property_id = _property_id
      AND e.entity_type = _entity_type
      AND e.entity_id = _entity_id
      AND e.event_type = ANY(COALESCE(_event_types, ARRAY[]::text[]))
      AND d.resolved_at IS NULL
    RETURNING d.id, d.event_id
  ),
  audit AS (
    INSERT INTO public.operational_notification_audit(
      event_id, delivery_id, actor_user_id, action, from_state, to_state, metadata
    )
    SELECT c.event_id, c.id, _actor_user_id, 'resolved', 'open', 'resolved',
      jsonb_build_object('reason', COALESCE(_reason, 'source_entity_resolved'))
    FROM changed c
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM changed;
  RETURN v_count;
END;
$nsc$;
REVOKE ALL ON FUNCTION nsc_private.staynas_resolve_entity_notifications(uuid,text,uuid,text[],uuid,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staynas_nsc_housekeeping_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_property_id uuid;
  v_reporter uuid;
  v_assignee uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_roles public.app_role[] := ARRAY['owner','manager','admin']::public.app_role[];
  v_severity text := 'info';
  v_title text;
  v_body text;
BEGIN
  SELECT COALESCE(t.property_id, rs.property_id, r.property_id)
    INTO v_property_id
  FROM public.housekeeping_events e
  LEFT JOIN public.ops_tasks t ON t.id = e.task_id
  LEFT JOIN public.housekeeping_exceptions hx ON hx.id = e.exception_id
  LEFT JOIN public.room_states rs ON rs.id = COALESCE(e.room_state_id, hx.room_state_id)
  LEFT JOIN public.rooms r ON r.id = rs.room_id
  WHERE e.id = NEW.id;

  IF NEW.exception_id IS NOT NULL THEN
    SELECT reported_by, assigned_to INTO v_reporter, v_assignee
    FROM public.housekeeping_exceptions
    WHERE id = NEW.exception_id;
  END IF;
  SELECT CASE WHEN NEW.event_type = 'inspection_requested'
      THEN COALESCE(v_assignee, NEW.assignee_id, hi.inspector_id, t.assignee_id)
      ELSE COALESCE(v_assignee, NEW.assignee_id, t.assignee_id, hi.inspector_id)
    END INTO v_assignee
  FROM (SELECT 1) seed
  LEFT JOIN public.ops_tasks t ON t.id = NEW.task_id
  LEFT JOIN public.housekeeping_inspections hi ON hi.id = NEW.inspection_id;

  v_entity_id := COALESCE(NEW.exception_id, NEW.task_id, NEW.room_state_id);
  v_entity_type := CASE
    WHEN NEW.exception_id IS NOT NULL THEN 'housekeeping_exception'
    WHEN NEW.task_id IS NOT NULL THEN 'housekeeping_task'
    WHEN NEW.room_state_id IS NOT NULL THEN 'room_state'
    ELSE 'housekeeping_event'
  END;

  IF NEW.event_type IN ('task_created','task_assigned','cleaning_started') THEN
    v_roles := v_roles || ARRAY['housekeeping']::public.app_role[];
  END IF;
  IF NEW.event_type IN ('inspection_passed','room_ready') THEN
    v_roles := v_roles || ARRAY['reception']::public.app_role[];
  END IF;
  IF NEW.event_type = 'maintenance_escalated' THEN
    v_severity := 'critical';
  ELSIF NEW.event_type IN ('inspection_failed','exception_reported') THEN
    v_severity := 'warning';
  END IF;

  v_title := initcap(replace(NEW.event_type, '_', ' '));
  v_body := COALESCE(NEW.payload->>'summary', v_title);

  IF v_property_id IS NOT NULL THEN
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_property_id, 'operations.housekeeping', 'housekeeping:' || NEW.id::text,
      NEW.event_type, 'operations.housekeeping', v_entity_type,
      v_entity_id, COALESCE(auth.uid(), NEW.actor_id),
      CASE WHEN NEW.event_type IN ('exception_reported','exception_resolved') THEN NULL ELSE v_assignee END,
      v_reporter,
      v_roles, v_severity, v_title, v_body, '/admin/operations/housekeeping',
      NEW.payload, NEW.correlation_id, NEW.created_at
    );

    IF NEW.event_type = 'exception_resolved' AND NEW.exception_id IS NOT NULL THEN
      PERFORM nsc_private.staynas_resolve_entity_notifications(
        v_property_id, 'housekeeping_exception', NEW.exception_id,
        ARRAY['exception_reported','maintenance_escalated']::text[],
        COALESCE(auth.uid(), NEW.actor_id), 'housekeeping_exception_resolved'
      );
    ELSIF NEW.event_type = 'inspection_passed' AND NEW.task_id IS NOT NULL THEN
      PERFORM nsc_private.staynas_resolve_entity_notifications(
        v_property_id, 'housekeeping_task', NEW.task_id,
        ARRAY['task_created','task_assigned','cleaning_started','cleaning_completed','inspection_requested','inspection_failed']::text[],
        COALESCE(auth.uid(), NEW.actor_id), 'housekeeping_inspection_passed'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$nsc$;

DROP TRIGGER IF EXISTS staynas_nsc_housekeeping_event ON public.housekeeping_events;
CREATE TRIGGER staynas_nsc_housekeeping_event
  AFTER INSERT ON public.housekeeping_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_housekeeping_event();

-- Booking lifecycle notifications are staff operational events, not guest emails.
-- Guest-facing email delivery remains in pending_notifications and its existing worker.
CREATE OR REPLACE FUNCTION public.staynas_nsc_booking_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_roles public.app_role[];
  v_severity text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'operations.reservations', 'booking:' || NEW.id::text || ':created',
      'booking_created', 'operations.reservations', 'booking', NEW.id, auth.uid(), NULL, NULL,
      ARRAY['reservations','reception','owner','manager','admin']::public.app_role[],
      'info', 'New reservation',
      'Reservation ' || COALESCE(NEW.reference, NEW.id::text) || ' — ' || COALESCE(NEW.guest_name, 'Guest'),
      '/admin/bookings/' || NEW.id::text,
      jsonb_build_object('booking_id', NEW.id, 'reference', NEW.reference, 'status', NEW.status, 'payment_status', NEW.payment_status),
      NULL, now()
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_roles := CASE WHEN NEW.status::text IN ('cancelled','no_show')
      THEN ARRAY['reservations','owner','manager','admin']::public.app_role[]
      ELSE ARRAY['reservations','reception','owner','manager','admin']::public.app_role[] END;
    v_severity := CASE WHEN NEW.status::text IN ('cancelled','no_show') THEN 'warning' ELSE 'info' END;
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'operations.reservations',
      'booking:' || NEW.id::text || ':status:' || NEW.status::text,
      'booking_' || NEW.status::text, 'operations.reservations', 'booking', NEW.id, auth.uid(), NULL, NULL,
      v_roles, v_severity, 'Reservation ' || replace(NEW.status::text, '_', ' '),
      'Reservation ' || COALESCE(NEW.reference, NEW.id::text) || ' — ' || COALESCE(NEW.guest_name, 'Guest'),
      '/admin/bookings/' || NEW.id::text,
      jsonb_build_object('booking_id', NEW.id, 'reference', NEW.reference, 'from_status', OLD.status, 'status', NEW.status),
      NULL, now()
    );
  END IF;

  IF (
       NEW.check_in IS DISTINCT FROM OLD.check_in
       OR NEW.check_out IS DISTINCT FROM OLD.check_out
       OR NEW.room_id IS DISTINCT FROM OLD.room_id
       OR NEW.adults IS DISTINCT FROM OLD.adults
       OR NEW.children IS DISTINCT FROM OLD.children
       OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
       OR NEW.guest_email IS DISTINCT FROM OLD.guest_email
       OR NEW.guest_phone IS DISTINCT FROM OLD.guest_phone
       OR NEW.special_requests IS DISTINCT FROM OLD.special_requests
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.visit_purpose IS DISTINCT FROM OLD.visit_purpose
       OR NEW.guest_type IS DISTINCT FROM OLD.guest_type
       OR NEW.guest_id IS DISTINCT FROM OLD.guest_id
     ) THEN
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'operations.reservations',
      'booking:' || NEW.id::text || ':modified:' || clock_timestamp()::text,
      'booking_modified', 'operations.reservations', 'booking', NEW.id, auth.uid(), NULL, NULL,
      ARRAY['reservations','reception','owner','manager','admin']::public.app_role[],
      'info', 'Reservation modified',
      'Reservation ' || COALESCE(NEW.reference, NEW.id::text) || ' — ' || COALESCE(NEW.guest_name, 'Guest'),
      '/admin/bookings/' || NEW.id::text,
      jsonb_build_object('booking_id', NEW.id, 'reference', NEW.reference,
        'check_in', NEW.check_in, 'check_out', NEW.check_out, 'room_id', NEW.room_id,
        'adults', NEW.adults, 'children', NEW.children, 'total', NEW.total, 'currency', NEW.currency),
      NULL, now()
    );
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    v_severity := CASE WHEN NEW.payment_status::text IN ('unpaid','payment_mismatch') THEN 'warning' ELSE 'info' END;
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'operations.finance',
      'booking:' || NEW.id::text || ':payment:' || NEW.payment_status::text,
      'booking_payment_' || NEW.payment_status::text, 'finance', 'booking', NEW.id, auth.uid(), NULL, NULL,
      ARRAY['finance','owner','manager','admin']::public.app_role[],
      v_severity, 'Reservation payment ' || replace(NEW.payment_status::text, '_', ' '),
      'Reservation ' || COALESCE(NEW.reference, NEW.id::text) || ' — ' || COALESCE(NEW.guest_name, 'Guest'),
      '/admin/bookings/' || NEW.id::text,
      jsonb_build_object('booking_id', NEW.id, 'reference', NEW.reference, 'from_payment_status', OLD.payment_status, 'payment_status', NEW.payment_status),
      NULL, now()
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('cancelled','completed','no_show') THEN
    PERFORM nsc_private.staynas_resolve_entity_notifications(
      NEW.property_id, 'booking', NEW.id,
      ARRAY['booking_created','booking_pending','booking_confirmed','booking_checked_in']::text[],
      auth.uid(), 'booking_terminal_status'
    );
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status::text IN ('paid','deposit_paid') THEN
    PERFORM nsc_private.staynas_resolve_entity_notifications(
      NEW.property_id, 'booking', NEW.id,
      ARRAY['booking_payment_unpaid','booking_payment_payment_mismatch']::text[],
      auth.uid(), 'booking_payment_settled'
    );
  END IF;

  RETURN NEW;
END;
$nsc$;

DROP TRIGGER IF EXISTS staynas_nsc_booking_created ON public.bookings;
CREATE TRIGGER staynas_nsc_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_booking_event();
DROP TRIGGER IF EXISTS staynas_nsc_booking_updated ON public.bookings;
CREATE TRIGGER staynas_nsc_booking_updated
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_booking_event();

-- Non-housekeeping operational task lifecycle. Housekeeping retains its richer
-- domain event taxonomy and is mirrored by the dedicated trigger above.
CREATE OR REPLACE FUNCTION public.staynas_nsc_ops_task_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_event_type text;
  v_property_id uuid;
  v_roles public.app_role[] := ARRAY['owner','manager','admin']::public.app_role[];
  v_severity text := 'info';
BEGIN
  IF COALESCE(NEW.category, '') = 'housekeeping' THEN RETURN NEW; END IF;
  v_property_id := NEW.property_id;
  IF v_property_id IS NULL AND NEW.room_state_id IS NOT NULL THEN
    SELECT r.property_id INTO v_property_id
    FROM public.room_states rs JOIN public.rooms r ON r.id = rs.room_id
    WHERE rs.id = NEW.room_state_id;
  END IF;
  IF v_property_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE WHEN NEW.assignee_id IS NULL THEN 'ops_task_unassigned' ELSE 'ops_task_created' END;
    IF NEW.assignee_id IS NULL THEN v_severity := 'warning'; END IF;
    IF NEW.category = 'maintenance' THEN
      v_roles := v_roles || ARRAY['housekeeping']::public.app_role[];
      v_severity := CASE WHEN NEW.priority = 1 THEN 'critical' ELSE 'warning' END;
    END IF;
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_property_id, 'operations.tasks', 'ops-task:' || NEW.id::text || ':created',
      v_event_type, 'operations.tasks', 'ops_task', NEW.id, auth.uid(), NEW.assignee_id, NULL,
      v_roles, v_severity, CASE WHEN NEW.assignee_id IS NULL THEN 'Operational task unassigned' ELSE 'Operational task created' END, NEW.title,
      '/admin/operations/tasks',
      jsonb_build_object('task_id', NEW.id, 'category', NEW.category, 'status', NEW.status),
      NULL, COALESCE(NEW.created_at, now())
    );
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
    v_event_type := 'ops_task_assigned';
    v_roles := ARRAY['owner','manager','admin']::public.app_role[];
    IF NEW.category = 'maintenance' THEN v_roles := v_roles || ARRAY['housekeeping']::public.app_role[]; END IF;
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_property_id, 'operations.tasks',
      'ops-task:' || NEW.id::text || ':assigned:' || NEW.assignee_id::text,
      v_event_type, 'operations.tasks', 'ops_task', NEW.id, auth.uid(), NEW.assignee_id, NULL,
      v_roles, 'warning', 'Operational task assigned', NEW.title,
      '/admin/operations/tasks',
      jsonb_build_object('task_id', NEW.id, 'category', NEW.category, 'assignee_id', NEW.assignee_id),
      NULL, COALESCE(NEW.updated_at, now())
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event_type := 'ops_task_status_' || NEW.status::text;
    v_roles := ARRAY['owner','manager','admin']::public.app_role[];
    IF NEW.category = 'maintenance' THEN v_roles := v_roles || ARRAY['housekeeping']::public.app_role[]; END IF;
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_property_id, 'operations.tasks',
      'ops-task:' || NEW.id::text || ':status:' || NEW.status::text || ':' || COALESCE(NEW.updated_at::text, now()::text),
      v_event_type, 'operations.tasks', 'ops_task', NEW.id, auth.uid(), NEW.assignee_id, NULL,
      v_roles, CASE WHEN NEW.status::text IN ('failed','cancelled') THEN 'warning' ELSE 'info' END,
      'Operational task ' || replace(NEW.status::text, '_', ' '), NEW.title,
      '/admin/operations/tasks',
      jsonb_build_object('task_id', NEW.id, 'category', NEW.category, 'from_status', OLD.status, 'status', NEW.status),
      NULL, COALESCE(NEW.updated_at, now())
    );
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status::text IN ('completed','cancelled')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM nsc_private.staynas_resolve_entity_notifications(
      v_property_id, 'ops_task', NEW.id,
      ARRAY['ops_task_unassigned','ops_task_created','ops_task_assigned','ops_task_overdue',
            'ops_task_status_pending','ops_task_status_in_progress']::text[],
      auth.uid(), 'operational_task_terminal_status'
    );
  END IF;

  RETURN NEW;
END;
$nsc$;

DROP TRIGGER IF EXISTS staynas_nsc_ops_task_event ON public.ops_tasks;
CREATE TRIGGER staynas_nsc_ops_task_event
  AFTER INSERT OR UPDATE OF assignee_id, status ON public.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_ops_task_event();

CREATE OR REPLACE FUNCTION public.staynas_nsc_folio_posting_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_property_id uuid;
  v_event_type text;
  v_dedupe_key text;
  v_severity text := 'info';
BEGIN
  SELECT property_id INTO v_property_id
  FROM public.bookings WHERE id = NEW.booking_id;
  IF v_property_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'folio_posting_' || NEW.status::text;
    v_dedupe_key := 'folio-posting:' || NEW.id::text || ':status:' || NEW.status::text;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event_type := 'folio_posting_' || NEW.status::text;
    v_dedupe_key := 'folio-posting:' || NEW.id::text || ':status:' || NEW.status::text;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.status::text IN ('failed','unknown','reversed') THEN
    v_severity := CASE WHEN NEW.status::text IN ('failed','reversed') THEN 'critical' ELSE 'warning' END;
  END IF;

  PERFORM nsc_private.staynas_publish_operational_notification(
    v_property_id, 'finance.folio', v_dedupe_key, v_event_type,
    'finance', 'folio_posting', NEW.id, COALESCE(auth.uid(), NEW.created_by), NULL, NULL,
    ARRAY['finance','owner','manager','admin']::public.app_role[],
    v_severity, 'Guest folio posting ' || replace(NEW.status::text, '_', ' '),
    COALESCE(NEW.description, 'Folio posting ' || NEW.id::text) || ' — ' || NEW.amount::text || ' ' || NEW.currency,
    '/admin/finance/folios',
    jsonb_build_object('folio_posting_id', NEW.id, 'booking_id', NEW.booking_id, 'status', NEW.status, 'amount', NEW.amount, 'currency', NEW.currency, 'failure_code', NEW.failure_code),
    NULL, COALESCE(NEW.updated_at, NEW.created_at, now())
  );
  IF NEW.status::text = 'posted' THEN
    PERFORM nsc_private.staynas_resolve_entity_notifications(
      v_property_id, 'folio_posting', NEW.id,
      ARRAY['folio_posting_created','folio_posting_pending','folio_posting_failed','folio_posting_unknown']::text[],
      COALESCE(auth.uid(), NEW.created_by), 'folio_posting_successfully_posted'
    );
  END IF;

  RETURN NEW;
END;
$nsc$;

DROP TRIGGER IF EXISTS staynas_nsc_folio_posting_event ON public.pms_folio_postings;
CREATE TRIGGER staynas_nsc_folio_posting_event
  AFTER INSERT OR UPDATE OF status ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_folio_posting_event();
REVOKE ALL ON FUNCTION public.staynas_nsc_folio_posting_event() FROM PUBLIC, anon, authenticated;

-- Authenticated recipients can only change their own acknowledgement lifecycle
-- through this constrained RPC. Queue processing and read/ack states are separate.
CREATE OR REPLACE FUNCTION nsc_private.staynas_operational_notification_transition(
  _delivery_id uuid,
  _action text
)
RETURNS public.operational_notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.operational_notification_deliveries%ROWTYPE;
  v_next text;
  v_audit_action text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _action NOT IN ('read','acknowledge','resolve') THEN RAISE EXCEPTION 'Invalid notification action'; END IF;

  SELECT * INTO v_row
  FROM public.operational_notification_deliveries
  WHERE id = _delivery_id
    AND recipient_user_id = v_uid
    AND public.staynas_user_has_property_access(v_uid, property_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found or access denied'; END IF;
  IF (_action = 'read' AND v_row.read_at IS NOT NULL)
     OR (_action = 'acknowledge' AND v_row.acknowledged_at IS NOT NULL)
     OR (_action = 'resolve' AND v_row.resolved_at IS NOT NULL) THEN
    RETURN v_row;
  END IF;

  IF _action = 'read' THEN
    UPDATE public.operational_notification_deliveries
    SET read_at = COALESCE(read_at, now()), updated_at = now()
    WHERE id = _delivery_id RETURNING * INTO v_row;
    v_next := 'read';
    v_audit_action := 'read';
  ELSIF _action = 'acknowledge' THEN
    UPDATE public.operational_notification_deliveries
    SET read_at = COALESCE(read_at, now()), acknowledged_at = COALESCE(acknowledged_at, now()), updated_at = now()
    WHERE id = _delivery_id RETURNING * INTO v_row;
    v_next := 'acknowledged';
    v_audit_action := 'acknowledged';
  ELSE
    UPDATE public.operational_notification_deliveries
    SET read_at = COALESCE(read_at, now()), acknowledged_at = COALESCE(acknowledged_at, now()),
        resolved_at = COALESCE(resolved_at, now()), updated_at = now()
    WHERE id = _delivery_id RETURNING * INTO v_row;
    v_next := 'resolved';
    v_audit_action := 'resolved';
  END IF;

  INSERT INTO public.operational_notification_audit(event_id, delivery_id, actor_user_id, action, from_state, to_state)
  VALUES(v_row.event_id, v_row.id, v_uid, v_audit_action, NULL, v_next);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION nsc_private.staynas_operational_notification_transition(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nsc_private.staynas_operational_notification_transition(uuid,text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.staynas_operational_notification_transition(
  _delivery_id uuid, _action text
)
RETURNS public.operational_notification_deliveries
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, nsc_private
AS $nsc$
  SELECT nsc_private.staynas_operational_notification_transition($1, $2)
$nsc$;
REVOKE ALL ON FUNCTION public.staynas_operational_notification_transition(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_operational_notification_transition(uuid,text) TO authenticated, service_role;

-- Guest requests generate staff operational work items independently of guest email.
-- The existing pending_notifications worker remains the guest-facing communication path.
CREATE OR REPLACE FUNCTION public.staynas_nsc_guest_request_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_event_type text;
  v_dedupe_key text;
  v_assignee uuid;
  v_roles public.app_role[] := ARRAY['owner','manager','admin','reception']::public.app_role[];
  v_severity text := 'info';
BEGIN
  IF NEW.operational_task_id IS NOT NULL THEN
    SELECT assignee_id INTO v_assignee
    FROM public.ops_tasks
    WHERE id = NEW.operational_task_id AND property_id = NEW.property_id;
  END IF;
  IF NEW.category IN ('housekeeping','maintenance') THEN
    v_roles := ARRAY['owner','manager','admin','housekeeping']::public.app_role[];
  END IF;
  IF NEW.priority = 1 OR NEW.status = 'escalated' THEN
    v_severity := 'critical';
  ELSIF NEW.priority = 2 THEN
    v_severity := 'warning';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'guest-experience.requests', 'guest-request:' || NEW.id::text || ':received',
      'guest_request_received', 'guest-experience', 'guest_request', NEW.id,
      COALESCE(auth.uid(), NEW.status_updated_by, NEW.created_by), v_assignee, NEW.created_by,
      v_roles, v_severity, 'Guest request received', left(NEW.request_text, 240),
      '/admin/guests/requests',
      jsonb_build_object('request_id', NEW.id, 'category', NEW.category, 'status', NEW.status, 'priority', NEW.priority, 'booking_id', NEW.booking_id),
      NULL, COALESCE(NEW.updated_at, NEW.created_at, now())
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event_type := 'guest_request_' || NEW.status;
    v_dedupe_key := 'guest-request:' || NEW.id::text || ':status:' || NEW.status;
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'guest-experience.requests', v_dedupe_key, v_event_type,
      'guest-experience', 'guest_request', NEW.id,
      COALESCE(auth.uid(), NEW.status_updated_by, NEW.created_by), v_assignee, NEW.created_by,
      v_roles, v_severity, initcap(replace(v_event_type, '_', ' ')),
      left(NEW.request_text, 240), '/admin/guests/requests',
      jsonb_build_object('request_id', NEW.id, 'category', NEW.category, 'status', NEW.status, 'priority', NEW.priority, 'booking_id', NEW.booking_id),
      NULL, COALESCE(NEW.updated_at, now())
    );
  END IF;

  IF NEW.operational_task_id IS DISTINCT FROM OLD.operational_task_id AND NEW.operational_task_id IS NOT NULL THEN
    PERFORM nsc_private.staynas_publish_operational_notification(
      NEW.property_id, 'guest-experience.requests',
      'guest-request:' || NEW.id::text || ':task:' || NEW.operational_task_id::text,
      'guest_request_task_linked', 'guest-experience', 'guest_request', NEW.id,
      COALESCE(auth.uid(), NEW.status_updated_by, NEW.created_by), v_assignee, NEW.created_by,
      v_roles, v_severity, 'Guest request task assigned',
      left(NEW.request_text, 240), '/admin/guests/requests',
      jsonb_build_object('request_id', NEW.id, 'task_id', NEW.operational_task_id, 'category', NEW.category, 'status', NEW.status),
      NULL, COALESCE(NEW.updated_at, now())
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('fulfilled','cancelled') THEN
    PERFORM nsc_private.staynas_resolve_entity_notifications(
      NEW.property_id, 'guest_request', NEW.id,
      ARRAY['guest_request_received','guest_request_task_linked','guest_request_overdue',
            'guest_request_triaged','guest_request_assigned','guest_request_in_progress','guest_request_escalated']::text[],
      COALESCE(auth.uid(), NEW.status_updated_by, NEW.created_by), 'guest_request_terminal_status'
    );
  END IF;

  RETURN NEW;
END;
$nsc$;

DROP TRIGGER IF EXISTS staynas_nsc_guest_request_event ON public.staynas_guest_requests;
CREATE TRIGGER staynas_nsc_guest_request_event
  AFTER INSERT OR UPDATE OF status, operational_task_id
  ON public.staynas_guest_requests
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_guest_request_event();

-- Room state changes that alter operational readiness / sellable inventory
-- are routed to the same property's front office and operations staff.
CREATE OR REPLACE FUNCTION public.staynas_nsc_room_state_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_property_id uuid;
  v_roles public.app_role[] := ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[];
  v_event_type text;
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN RETURN NEW; END IF;
  SELECT property_id INTO v_property_id FROM public.rooms WHERE id = NEW.room_id;
  IF v_property_id IS NULL THEN RETURN NEW; END IF;

  IF OLD.state::text IN ('out_of_service','maintenance') THEN
    PERFORM nsc_private.staynas_resolve_entity_notifications(
      v_property_id, 'room_state', NEW.id,
      ARRAY['room_state_out_of_service','room_state_maintenance']::text[],
      auth.uid(), 'room_returned_to_service'
    );
  END IF;

  IF NEW.state::text IN ('out_of_service','maintenance') THEN
    v_event_type := 'room_state_' || NEW.state::text;
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_property_id, 'operations.rooms',
      'room-state:' || NEW.id::text || ':' || v_event_type || ':' || COALESCE(NEW.updated_at::text, now()::text),
      v_event_type, 'operations.rooms', 'room_state', NEW.id, auth.uid(), NULL, NULL,
      v_roles, 'critical', 'Room ' || replace(NEW.state::text, '_', ' '),
      'Room ' || COALESCE(NEW.unit_label, NEW.id::text) || ' changed operational state.',
      '/admin/operations/rooms',
      jsonb_build_object('room_state_id', NEW.id, 'room_id', NEW.room_id, 'state', NEW.state::text),
      NULL, now()
    );
  END IF;
  RETURN NEW;
END;
$nsc$;

DROP TRIGGER IF EXISTS staynas_nsc_room_state_event ON public.room_states;
CREATE TRIGGER staynas_nsc_room_state_event
  AFTER UPDATE OF state ON public.room_states
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_room_state_event();


-- Trigger-only security-definer functions are not RPC endpoints.
REVOKE ALL ON FUNCTION public.staynas_nsc_housekeeping_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_nsc_booking_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_nsc_ops_task_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_nsc_guest_request_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_nsc_room_state_event() FROM PUBLIC, anon, authenticated;

-- Retire unsafe legacy staff visibility while preserving direct-recipient system
-- notifications that do not belong to a property.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE CASCADE;

UPDATE public.notifications n
SET property_id = b.property_id
FROM public.bookings b
WHERE n.property_id IS NULL
  AND n.meta->>'booking_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND b.id = (n.meta->>'booking_id')::uuid;

UPDATE public.notifications n
SET property_id = (n.meta->>'property_id')::uuid
WHERE n.property_id IS NULL
  AND n.meta->>'property_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.staynas_properties p WHERE p.id = (n.meta->>'property_id')::uuid);

UPDATE public.notifications n
SET organisation_id = p.organisation_id
FROM public.staynas_properties p
WHERE n.property_id = p.id AND n.organisation_id IS NULL;

CREATE INDEX IF NOT EXISTS notifications_property_recipient_created_idx
  ON public.notifications(property_id, user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users mark own read" ON public.notifications;
DROP POLICY IF EXISTS "Staff create notifications" ON public.notifications;

CREATE POLICY operational_legacy_notifications_read
  ON public.notifications FOR SELECT TO authenticated
  USING (
    (
      user_id = (select auth.uid())
      AND (
        property_id IS NULL
        OR public.staynas_user_has_property_access((select auth.uid()), property_id)
      )
    )
    OR (
      user_id IS NULL
      AND property_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.staynas_property_members pm
        WHERE pm.property_id = notifications.property_id
          AND pm.user_id = (select auth.uid())
          AND pm.status = 'active'
          AND (
            pm.role::text = notifications.role
            OR pm.role = ANY(ARRAY['owner','manager','admin']::public.app_role[])
          )
      )
    )
  );

CREATE POLICY operational_legacy_notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    AND (
      property_id IS NULL
      OR public.staynas_user_has_property_access((select auth.uid()), property_id)
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND (
      property_id IS NULL
      OR public.staynas_user_has_property_access((select auth.uid()), property_id)
    )
  );

CREATE POLICY operational_legacy_notifications_insert
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_any_staff((select auth.uid()))
    AND (
      (user_id = (select auth.uid()) AND (property_id IS NULL OR public.staynas_user_has_property_access((select auth.uid()), property_id)))
      OR (user_id IS NULL AND property_id IS NOT NULL AND public.staynas_user_has_property_access((select auth.uid()), property_id))
    )
  );

-- pending_notifications is exclusively the guest email / service-message queue.
-- Staff clients must not enumerate it or infer guest communication processing as read state.
DROP POLICY IF EXISTS "Staff read pending_notifications" ON public.pending_notifications;
REVOKE SELECT ON public.pending_notifications FROM authenticated, anon;

-- Housekeeping events now fan out through the shared operational service.
-- Retain the source event table and RPC contract, but stop generating a second
-- independently visible staff notification stream.
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
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.housekeeping_events(
    event_type, room_state_id, task_id, inspection_id, exception_id,
    actor_id, assignee_id, payload, correlation_id
  )
  VALUES(
    _event_type, _room_state_id, _task_id, _inspection_id, _exception_id,
    COALESCE(_actor_id, auth.uid()), _assignee_id, COALESCE(_payload, '{}'::jsonb), _correlation_id
  )
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$nsc$;

DROP POLICY IF EXISTS "Users read own housekeeping notifications" ON public.housekeeping_notifications;
DROP POLICY IF EXISTS "Users mark own housekeeping notifications" ON public.housekeeping_notifications;
REVOKE SELECT, UPDATE ON public.housekeeping_notifications FROM authenticated, anon;


-- Escalate unacknowledged warning / critical operational work to active
-- property supervisors. This is a durable state transition, not a new event.
-- LexiBite inventory is a connected operational domain, not a guest or
-- commercial-founder notification contract. Emit only through an active,
-- reciprocally approved product connection with exact remote tenant/property mapping.
CREATE OR REPLACE FUNCTION public.staynas_nsc_lexibite_inventory_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, nsc_private
AS $nsc$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_tenant_id uuid;
  v_remote_property_id uuid;
  v_local_property_id uuid;
  v_item_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_event_type text;
  v_dedupe_key text;
  v_severity text := 'info';
  v_title text;
  v_body text;
  v_status text;
  v_movement text;
  v_quantity numeric;
  v_threshold numeric;
  v_item_name text;
  v_roles public.app_role[] := ARRAY['owner','manager','admin','finance']::public.app_role[];
  v_occurred_at timestamptz := COALESCE(NULLIF(v_new->>'occurred_at','')::timestamptz,
    NULLIF(v_new->>'updated_at','')::timestamptz, clock_timestamp());
  v_correlation_id uuid;
  v_conn record;
BEGIN
  v_tenant_id := NULLIF(v_new->>'tenant_id','')::uuid;
  v_remote_property_id := NULLIF(v_new->>'property_id','')::uuid;
  IF v_remote_property_id IS NULL THEN
    IF TG_TABLE_NAME = 'restaurant_stock_transfers' THEN
      SELECT l.property_id INTO v_remote_property_id
      FROM public.restaurant_locations l
      WHERE l.id = NULLIF(v_new->>'source_location_id','')::uuid
        AND l.tenant_id = v_tenant_id;
    ELSE
      SELECT l.property_id INTO v_remote_property_id
      FROM public.restaurant_locations l
      WHERE l.id = COALESCE(NULLIF(v_new->>'location_id','')::uuid,
                            NULLIF(v_new->>'source_location_id','')::uuid)
        AND l.tenant_id = v_tenant_id;
    END IF;
  END IF;
  IF v_tenant_id IS NULL OR v_remote_property_id IS NULL THEN RETURN NEW; END IF;

  v_status := v_new->>'status';
  v_entity_id := NULLIF(v_new->>'id','')::uuid;
  v_entity_type := TG_TABLE_NAME;
  v_item_id := COALESCE(NULLIF(v_new->>'inventory_item_id','')::uuid, v_entity_id);
  v_correlation_id := CASE
    WHEN COALESCE(v_new->>'correlation_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (v_new->>'correlation_id')::uuid ELSE NULL END;

  CASE TG_TABLE_NAME
    WHEN 'restaurant_inventory_items' THEN
      v_entity_type := 'inventory_item';
      v_quantity := NULLIF(v_new->>'current_quantity','')::numeric;
      v_threshold := COALESCE(NULLIF(v_new->>'reorder_point','')::numeric,
                              NULLIF(v_new->>'par_level','')::numeric);
      IF v_quantity IS NULL OR v_threshold IS NULL THEN RETURN NEW; END IF;
      IF v_quantity <= v_threshold THEN
        IF TG_OP = 'UPDATE'
           AND NULLIF(v_old->>'current_quantity','')::numeric <= v_threshold
           AND NULLIF(v_old->>'reorder_point','')::numeric IS NOT DISTINCT FROM NULLIF(v_new->>'reorder_point','')::numeric
           AND NULLIF(v_old->>'par_level','')::numeric IS NOT DISTINCT FROM NULLIF(v_new->>'par_level','')::numeric THEN
          RETURN NEW;
        END IF;
        v_event_type := 'inventory_low_stock';
        v_severity := 'warning';
        v_title := 'Inventory below reorder level';
        v_body := COALESCE(v_new->>'name','Inventory item') || ' is at ' || v_quantity::text ||
          ' (reorder level ' || v_threshold::text || ').';
        v_dedupe_key := 'lexibite:low-stock:' || v_item_id::text || ':' || to_char(v_occurred_at,'YYYYMMDDHH24MI');
        v_entity_id := v_item_id;
      ELSE
        IF TG_OP = 'UPDATE' AND NULLIF(v_old->>'current_quantity','')::numeric <=
          COALESCE(NULLIF(v_old->>'reorder_point','')::numeric,NULLIF(v_old->>'par_level','')::numeric) THEN
          FOR v_conn IN
            SELECT c.local_property_id FROM public.staynas_product_connections c
            WHERE c.remote_product='lexibite' AND c.remote_tenant_id=v_tenant_id
              AND c.remote_property_id=v_remote_property_id AND c.status='active'
              AND c.local_approved_at IS NOT NULL AND c.remote_approved_at IS NOT NULL
          LOOP
            PERFORM nsc_private.staynas_resolve_entity_notifications(
              v_conn.local_property_id,'inventory_item',v_item_id,
              ARRAY['inventory_low_stock']::text[],NULL,'inventory_replenished'
            );
          END LOOP;
        END IF;
        RETURN NEW;
      END IF;

    WHEN 'restaurant_stock_movements' THEN
      v_entity_type := 'inventory_item';
      v_movement := v_new->>'movement_type';
      IF v_movement NOT IN ('wastage','adjustment','adjustment_out','return_to_supplier','reversal','transfer_out') THEN
        RETURN NEW;
      END IF;
      v_event_type := 'inventory_stock_movement_' || v_movement;
      v_severity := CASE WHEN v_movement IN ('wastage','adjustment_out','return_to_supplier') THEN 'warning' ELSE 'info' END;
      v_title := 'Inventory ' || replace(v_movement,'_',' ');
      SELECT i.name INTO v_item_name FROM public.restaurant_inventory_items i
      WHERE i.id=v_item_id AND i.tenant_id=v_tenant_id AND i.property_id=v_remote_property_id;
      v_body := COALESCE(v_item_name,'Inventory item') || ': ' ||
        COALESCE(v_new->>'quantity','0') || ' units recorded';
      v_dedupe_key := 'lexibite:stock-movement:' || v_entity_id::text;
      v_entity_id := v_item_id;

    WHEN 'restaurant_purchase_orders' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status NOT IN ('submitted','approved','partially_received','received','cancelled') THEN RETURN NEW; END IF;
      v_event_type := 'inventory_purchase_order_' || v_status;
      v_severity := CASE WHEN v_status='cancelled' THEN 'warning' ELSE 'info' END;
      v_title := 'Purchase order ' || replace(v_status,'_',' ');
      v_body := 'Purchase order ' || COALESCE(v_new->>'reference',v_entity_id::text);
      v_dedupe_key := 'lexibite:purchase-order:' || v_entity_id::text || ':' || v_status || ':' || COALESCE(v_new->>'updated_at',clock_timestamp()::text);

    WHEN 'restaurant_goods_receipts' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status NOT IN ('posted','cancelled') THEN RETURN NEW; END IF;
      v_event_type := 'inventory_goods_receipt_' || v_status;
      v_severity := CASE WHEN v_status='cancelled' THEN 'warning' ELSE 'info' END;
      v_title := 'Goods receipt ' || v_status;
      v_body := 'Goods receipt ' || COALESCE(v_new->>'document_number',v_entity_id::text);
      v_dedupe_key := 'lexibite:goods-receipt:' || v_entity_id::text || ':' || v_status;

    WHEN 'restaurant_stocktakes' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status <> 'posted' OR COALESCE(NULLIF(v_new->>'variance_value','')::numeric,0)=0 THEN RETURN NEW; END IF;
      v_event_type := 'inventory_stocktake_variance';
      v_severity := 'warning';
      v_title := 'Stocktake variance posted';
      v_body := 'Stocktake ' || COALESCE(v_new->>'stocktake_number',v_entity_id::text) ||
        ' posted with variance ' || (v_new->>'variance_value') || ' ' || COALESCE(v_new->>'currency','');
      v_dedupe_key := 'lexibite:stocktake:' || v_entity_id::text || ':posted';

    WHEN 'restaurant_stock_transfers' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status' THEN RETURN NEW; END IF;
      IF v_status NOT IN ('requested','approved','rejected','dispatched','partially_received','received','completed','cancelled') THEN RETURN NEW; END IF;
      v_event_type := 'inventory_transfer_' || v_status;
      v_severity := CASE WHEN v_status IN ('rejected','cancelled') THEN 'warning' ELSE 'info' END;
      v_title := 'Stock transfer ' || replace(v_status,'_',' ');
      v_body := 'Stock transfer ' || COALESCE(v_new->>'transfer_number',v_entity_id::text);
      v_dedupe_key := 'lexibite:stock-transfer:' || v_entity_id::text || ':' || v_status;

    WHEN 'restaurant_reconciliation_exceptions' THEN
      IF TG_OP='UPDATE' AND v_new->>'status' IS NOT DISTINCT FROM v_old->>'status'
         AND v_new->>'resolution' IS NOT DISTINCT FROM v_old->>'resolution' THEN RETURN NEW; END IF;
      IF v_status IN ('resolved','closed') OR v_new->>'resolution' IS NOT NULL THEN
        v_event_type := 'inventory_reconciliation_exception_resolved';
        v_title := 'Inventory reconciliation exception resolved';
        v_severity := 'info';
      ELSE
        v_event_type := 'inventory_reconciliation_exception_opened';
        v_title := COALESCE(v_new->>'title','Inventory reconciliation exception');
        v_severity := CASE WHEN lower(COALESCE(v_new->>'severity','warning'))='critical' THEN 'critical' ELSE 'warning' END;
      END IF;
      v_body := COALESCE(v_new->>'what_happened',v_new->>'required_action','Inventory reconciliation requires attention');
      v_dedupe_key := 'lexibite:reconciliation-exception:' || v_entity_id::text || ':' || v_event_type;
    ELSE
      RETURN NEW;
  END CASE;

  FOR v_conn IN
    SELECT c.id,c.local_property_id
    FROM public.staynas_product_connections c
    WHERE c.remote_product='lexibite'
      AND c.remote_tenant_id=v_tenant_id
      AND c.remote_property_id=v_remote_property_id
      AND c.status='active'
      AND c.local_approved_at IS NOT NULL
      AND c.remote_approved_at IS NOT NULL
  LOOP
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_conn.local_property_id,
      'integrations.lexibite.inventory',
      v_dedupe_key,
      v_event_type,
      'inventory',
      v_entity_type,
      v_entity_id,
      NULL,NULL,NULL,
      v_roles,
      v_severity,
      left(COALESCE(v_title,'Inventory update'),200),
      left(COALESCE(v_body,'LexiBite inventory event'),1000),
      '/admin/inventory',
      jsonb_build_object(
        'source_product','lexibite','remote_tenant_id',v_tenant_id,
        'remote_property_id',v_remote_property_id,'source_table',TG_TABLE_NAME,
        'source_entity_id',v_entity_id,'event_type',v_event_type
      ),
      v_correlation_id,
      v_occurred_at
    );
    IF TG_TABLE_NAME='restaurant_reconciliation_exceptions'
       AND v_event_type='inventory_reconciliation_exception_resolved' THEN
      PERFORM nsc_private.staynas_resolve_entity_notifications(
        v_conn.local_property_id,'restaurant_reconciliation_exceptions',v_entity_id,
        ARRAY['inventory_reconciliation_exception_opened']::text[],NULL,'inventory_reconciliation_resolved'
      );
    END IF;
    IF TG_TABLE_NAME='restaurant_inventory_items' AND v_event_type='inventory_low_stock' THEN
      -- Low-stock event is already deduplicated per connected property and item update.
      NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$nsc$;
REVOKE ALL ON FUNCTION public.staynas_nsc_lexibite_inventory_event() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS staynas_nsc_lexibite_inventory_item_event ON public.restaurant_inventory_items;
CREATE TRIGGER staynas_nsc_lexibite_inventory_item_event
  AFTER INSERT OR UPDATE OF current_quantity, reorder_point, par_level, status
  ON public.restaurant_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();
DROP TRIGGER IF EXISTS staynas_nsc_lexibite_stock_movement_event ON public.restaurant_stock_movements;
CREATE TRIGGER staynas_nsc_lexibite_stock_movement_event
  AFTER INSERT ON public.restaurant_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();
DROP TRIGGER IF EXISTS staynas_nsc_lexibite_purchase_order_event ON public.restaurant_purchase_orders;
CREATE TRIGGER staynas_nsc_lexibite_purchase_order_event
  AFTER INSERT OR UPDATE OF status ON public.restaurant_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();
DROP TRIGGER IF EXISTS staynas_nsc_lexibite_goods_receipt_event ON public.restaurant_goods_receipts;
CREATE TRIGGER staynas_nsc_lexibite_goods_receipt_event
  AFTER INSERT OR UPDATE OF status ON public.restaurant_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();
DROP TRIGGER IF EXISTS staynas_nsc_lexibite_stocktake_event ON public.restaurant_stocktakes;
CREATE TRIGGER staynas_nsc_lexibite_stocktake_event
  AFTER INSERT OR UPDATE OF status, variance_value ON public.restaurant_stocktakes
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();
DROP TRIGGER IF EXISTS staynas_nsc_lexibite_stock_transfer_event ON public.restaurant_stock_transfers;
CREATE TRIGGER staynas_nsc_lexibite_stock_transfer_event
  AFTER INSERT OR UPDATE OF status ON public.restaurant_stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();
DROP TRIGGER IF EXISTS staynas_nsc_lexibite_reconciliation_exception_event ON public.restaurant_reconciliation_exceptions;
CREATE TRIGGER staynas_nsc_lexibite_reconciliation_exception_event
  AFTER INSERT OR UPDATE OF status, resolution ON public.restaurant_reconciliation_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_nsc_lexibite_inventory_event();

CREATE OR REPLACE FUNCTION nsc_private.staynas_escalate_operational_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $nsc$
DECLARE
  v_escalated integer := 0;
  v_count integer := 0;
  v_task record;
  v_request record;
BEGIN
  -- Unassigned / overdue operations tasks escalate to the same property's
  -- supervisor team, with the assigned operator included when present.
  FOR v_task IN
    SELECT t.id, t.title, t.category, t.priority, t.status, t.due_at,
           t.assignee_id, COALESCE(t.property_id, rs.property_id, b.property_id) AS resolved_property_id
    FROM public.ops_tasks t
    LEFT JOIN public.room_states rs ON rs.id = t.room_state_id
    LEFT JOIN public.bookings b ON b.id = t.booking_id
    WHERE t.status::text NOT IN ('completed','cancelled')
      AND t.due_at IS NOT NULL AND t.due_at < now()
      AND COALESCE(t.property_id, rs.property_id, b.property_id) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.operational_notification_events e
        WHERE e.property_id = COALESCE(t.property_id, rs.property_id, b.property_id)
          AND e.dedupe_key = 'ops-task:' || t.id::text || ':overdue:' || t.due_at::text
      )
    ORDER BY t.due_at
    LIMIT 200
  LOOP
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_task.resolved_property_id, 'operations.tasks',
      'ops-task:' || v_task.id::text || ':overdue:' || v_task.due_at::text,
      'ops_task_overdue', 'operations.tasks', 'ops_task', v_task.id, NULL,
      v_task.assignee_id, NULL,
      CASE WHEN v_task.category IN ('housekeeping','maintenance')
        THEN ARRAY['owner','manager','admin','housekeeping']::public.app_role[]
        ELSE ARRAY['owner','manager','admin']::public.app_role[] END,
      CASE WHEN v_task.priority = 1 THEN 'critical' ELSE 'warning' END,
      'Overdue operational task', v_task.title,
      '/admin/operations/tasks',
      jsonb_build_object('task_id', v_task.id, 'category', v_task.category, 'status', v_task.status, 'due_at', v_task.due_at),
      NULL, now()
    );
    v_escalated := v_escalated + 1;
  END LOOP;

  -- Guest requests that have passed their requested service time and remain
  -- unfulfilled / uncancelled escalate to property guest-service supervisors.
  FOR v_request IN
    SELECT g.id, g.property_id, g.category, g.priority, g.status, g.request_text,
           g.created_by, g.requested_for, t.assignee_id
    FROM public.staynas_guest_requests g
    LEFT JOIN public.ops_tasks t
      ON t.id = g.operational_task_id AND t.property_id = g.property_id
    WHERE g.status NOT IN ('fulfilled','cancelled')
      AND g.requested_for IS NOT NULL AND g.requested_for < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.operational_notification_events e
        WHERE e.property_id = g.property_id
          AND e.dedupe_key = 'guest-request:' || g.id::text || ':overdue:' || g.requested_for::text
      )
    ORDER BY g.requested_for
    LIMIT 200
  LOOP
    PERFORM nsc_private.staynas_publish_operational_notification(
      v_request.property_id, 'guest-experience.requests',
      'guest-request:' || v_request.id::text || ':overdue:' || v_request.requested_for::text,
      'guest_request_overdue', 'guest-experience', 'guest_request', v_request.id, NULL,
      v_request.assignee_id, v_request.created_by,
      CASE WHEN v_request.category IN ('housekeeping','maintenance')
        THEN ARRAY['owner','manager','admin','housekeeping']::public.app_role[]
        ELSE ARRAY['owner','manager','admin','reception']::public.app_role[] END,
      CASE WHEN v_request.priority = 1 THEN 'critical' ELSE 'warning' END,
      'Overdue guest request', left(v_request.request_text, 240),
      '/admin/guests/requests',
      jsonb_build_object('request_id', v_request.id, 'category', v_request.category, 'status', v_request.status, 'requested_for', v_request.requested_for),
      NULL, now()
    );
    v_escalated := v_escalated + 1;
  END LOOP;

  -- Escalate unacknowledged notification deliveries to active supervisors.
  WITH due AS (
    SELECT d.id, d.event_id, d.organisation_id, d.property_id
    FROM public.operational_notification_deliveries d
    JOIN public.operational_notification_events e ON e.id = d.event_id
    WHERE d.acknowledged_at IS NULL
      AND d.resolved_at IS NULL
      AND d.escalation_level = 0
      AND d.status IN ('pending','sent','delivered','failed')
      AND d.created_at <= now() - CASE e.severity
        WHEN 'critical' THEN interval '5 minutes'
        WHEN 'warning' THEN interval '15 minutes'
        ELSE interval '2 hours'
      END
    ORDER BY d.created_at
    LIMIT 200
    FOR UPDATE OF d SKIP LOCKED
  ),
  marked AS (
    UPDATE public.operational_notification_deliveries d
    SET escalation_level = 1, escalated_at = now(), updated_at = now()
    FROM due
    WHERE d.id = due.id
    RETURNING d.id, d.event_id, d.organisation_id, d.property_id
  ),
  supervisors AS (
    INSERT INTO public.operational_notification_deliveries(
      event_id, organisation_id, property_id, recipient_user_id, channel, status, attempt_count
    )
    SELECT DISTINCT m.event_id, m.organisation_id, m.property_id, pm.user_id, 'in_app', 'delivered', 1
    FROM marked m
    JOIN public.staynas_property_members pm
      ON pm.property_id = m.property_id
     AND pm.status = 'active'
     AND pm.role = ANY(ARRAY['owner','manager','admin']::public.app_role[])
    ON CONFLICT (event_id, recipient_user_id, channel) DO NOTHING
    RETURNING id, event_id, recipient_user_id
  ),
  supervisor_audit AS (
    INSERT INTO public.operational_notification_audit(
      event_id, delivery_id, action, from_state, to_state, metadata
    )
    SELECT s.event_id, s.id, 'delivered', 'pending', 'delivered',
      jsonb_build_object('channel','in_app','recipient_user_id',s.recipient_user_id,'escalation',true)
    FROM supervisors s
    RETURNING id
  ),
  escalation_audit AS (
    INSERT INTO public.operational_notification_audit(
      event_id, delivery_id, action, from_state, to_state, metadata
    )
    SELECT m.event_id, m.id, 'escalated', 'unacknowledged', 'supervisor_escalation',
      jsonb_build_object('reason','acknowledgement_timeout')
    FROM marked m
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM marked;

  RETURN v_escalated + v_count;
END;
$nsc$;

REVOKE ALL ON FUNCTION nsc_private.staynas_escalate_operational_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nsc_private.staynas_escalate_operational_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_escalate_operational_notifications()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, nsc_private
AS $nsc$
  SELECT nsc_private.staynas_escalate_operational_notifications()
$nsc$;
REVOKE ALL ON FUNCTION public.staynas_escalate_operational_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_escalate_operational_notifications() TO service_role;


SELECT cron.unschedule('staynas-operational-notification-escalation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'staynas-operational-notification-escalation');
SELECT cron.schedule(
  'staynas-operational-notification-escalation',
  '*/5 * * * *',
  $cron$ SELECT public.staynas_escalate_operational_notifications(); $cron$
);

COMMIT;
