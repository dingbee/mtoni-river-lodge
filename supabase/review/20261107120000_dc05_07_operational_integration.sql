-- DC-05.07 — channel reservation operational integration.
-- Review-only migration. CI/UAT artifact; never apply to production without separate approval.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_reservation_links') IS NULL
     OR to_regclass('public.staynas_distribution_webhook_inbox') IS NULL
     OR to_regclass('public.staynas_distribution_financial_evidence') IS NULL
     OR to_regclass('public.bookings') IS NULL
     OR to_regclass('public.guests') IS NULL
     OR to_regclass('public.room_states') IS NULL
     OR to_regclass('public.ops_tasks') IS NULL
     OR to_regclass('public.ops_alerts') IS NULL
     OR to_regprocedure('public.staynas_user_has_property_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'DC-05.07 requires canonical bookings, guest CRM, room states, operations and DC-05.06 finance evidence';
  END IF;
END
$dependencies$;

-- Extend the existing operating tables with the property keys they lacked.
-- Backfill from their canonical booking/room relations before replacing the
-- former global-staff RLS policies.
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL;
UPDATE public.ops_tasks t
SET property_id=b.property_id
FROM public.bookings b
WHERE t.booking_id=b.id AND t.property_id IS NULL;
UPDATE public.ops_tasks t
SET room_state_id=rs.id
FROM public.room_states rs
WHERE t.booking_id=rs.booking_id AND t.room_state_id IS NULL;
CREATE INDEX IF NOT EXISTS ops_tasks_property_status_due_idx
  ON public.ops_tasks(property_id,status,due_at);
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.ops_tasks TO authenticated,service_role;

DROP POLICY IF EXISTS "Staff manage ops_tasks" ON public.ops_tasks;
DROP POLICY IF EXISTS staynas_ops_tasks_property_scope ON public.ops_tasks;
CREATE POLICY staynas_ops_tasks_property_scope ON public.ops_tasks
  FOR ALL TO authenticated
  USING (
    (property_id IS NOT NULL AND public.staynas_user_has_property_access(auth.uid(),property_id))
    OR (property_id IS NULL AND public.is_any_staff(auth.uid()))
  )
  WITH CHECK (
    (property_id IS NOT NULL AND public.staynas_user_has_property_access(auth.uid(),property_id))
    OR (property_id IS NULL AND public.is_any_staff(auth.uid()))
  );

ALTER TABLE public.ops_alerts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
UPDATE public.ops_alerts a
SET property_id=b.property_id
FROM public.bookings b
WHERE a.booking_id=b.id AND a.property_id IS NULL;
UPDATE public.ops_alerts a
SET property_id=r.property_id
FROM public.rooms r
WHERE a.room_id=r.id AND a.property_id IS NULL;
CREATE INDEX IF NOT EXISTS ops_alerts_property_open_idx
  ON public.ops_alerts(property_id,resolved_at) WHERE resolved_at IS NULL;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ops_alerts TO authenticated,service_role;

DROP POLICY IF EXISTS "Staff manage ops_alerts" ON public.ops_alerts;
DROP POLICY IF EXISTS staynas_ops_alerts_property_scope ON public.ops_alerts;
CREATE POLICY staynas_ops_alerts_property_scope ON public.ops_alerts
  FOR ALL TO authenticated
  USING (
    (property_id IS NOT NULL AND public.staynas_user_has_property_access(auth.uid(),property_id))
    OR (property_id IS NULL AND public.is_any_staff(auth.uid()))
  )
  WITH CHECK (
    (property_id IS NOT NULL AND public.staynas_user_has_property_access(auth.uid(),property_id))
    OR (property_id IS NULL AND public.is_any_staff(auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.staynas_enforce_ops_task_property_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_booking_property uuid;
  v_room_property uuid;
  v_room_state_id uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT b.property_id INTO v_booking_property
    FROM public.bookings b WHERE b.id=NEW.booking_id;
    IF v_booking_property IS NULL THEN
      RAISE EXCEPTION 'Operations task booking scope is invalid.' USING ERRCODE='42501';
    END IF;
    IF NEW.property_id IS NULL THEN
      NEW.property_id:=v_booking_property;
    ELSIF NEW.property_id IS DISTINCT FROM v_booking_property THEN
      RAISE EXCEPTION 'Operations task property does not match its booking.' USING ERRCODE='42501';
    END IF;
    IF NEW.room_state_id IS NULL THEN
      SELECT rs.id INTO v_room_state_id FROM public.room_states rs
      WHERE rs.booking_id=NEW.booking_id ORDER BY rs.id LIMIT 1;
      NEW.room_state_id:=v_room_state_id;
    END IF;
  END IF;
  IF NEW.room_state_id IS NOT NULL THEN
    SELECT r.property_id INTO v_room_property
    FROM public.room_states rs JOIN public.rooms r ON r.id=rs.room_id
    WHERE rs.id=NEW.room_state_id;
    IF NEW.property_id IS NULL THEN
      NEW.property_id:=v_room_property;
    END IF;
    IF v_room_property IS NULL OR v_room_property IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'Operations task room assignment crosses property scope.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_enforce_ops_task_property_scope()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_ops_task_property_scope ON public.ops_tasks;
CREATE TRIGGER staynas_ops_task_property_scope
  BEFORE INSERT OR UPDATE OF booking_id,property_id,room_state_id
  ON public.ops_tasks FOR EACH ROW
  EXECUTE FUNCTION public.staynas_enforce_ops_task_property_scope();

CREATE OR REPLACE FUNCTION public.staynas_enforce_ops_alert_property_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_booking_property uuid;
  v_room_property uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT b.property_id INTO v_booking_property
    FROM public.bookings b WHERE b.id=NEW.booking_id;
    IF v_booking_property IS NULL THEN
      RAISE EXCEPTION 'Operations alert booking scope is invalid.' USING ERRCODE='42501';
    END IF;
    IF NEW.property_id IS NULL THEN
      NEW.property_id:=v_booking_property;
    ELSIF NEW.property_id IS DISTINCT FROM v_booking_property THEN
      RAISE EXCEPTION 'Operations alert property does not match its booking.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT r.property_id INTO v_room_property
    FROM public.rooms r WHERE r.id=NEW.room_id;
    IF v_room_property IS NULL OR (NEW.property_id IS NOT NULL AND v_room_property IS DISTINCT FROM NEW.property_id) THEN
      RAISE EXCEPTION 'Operations alert room assignment crosses property scope.' USING ERRCODE='42501';
    END IF;
    NEW.property_id:=COALESCE(NEW.property_id,v_room_property);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_enforce_ops_alert_property_scope()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_ops_alert_property_scope ON public.ops_alerts;
CREATE TRIGGER staynas_ops_alert_property_scope
  BEFORE INSERT OR UPDATE OF booking_id,property_id,room_id
  ON public.ops_alerts FOR EACH ROW
  EXECUTE FUNCTION public.staynas_enforce_ops_alert_property_scope();

ALTER TABLE public.room_states ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.room_states TO authenticated,service_role;
DROP POLICY IF EXISTS "Staff manage room_states" ON public.room_states;
DROP POLICY IF EXISTS staynas_room_states_property_scope ON public.room_states;
CREATE POLICY staynas_room_states_property_scope ON public.room_states
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id=room_states.room_id
      AND public.staynas_user_has_property_access(auth.uid(),r.property_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id=room_states.room_id
      AND public.staynas_user_has_property_access(auth.uid(),r.property_id)
  ));

-- A physical room is allocated for the reservation's date range. This is
-- separate from room_states, which describes the unit's present housekeeping/
-- occupancy condition. It avoids marking a future room occupied or blocking a
-- unit outside the dates for which it is actually reserved.
CREATE TABLE IF NOT EXISTS public.staynas_distribution_room_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  room_state_id uuid NOT NULL REFERENCES public.room_states(id) ON DELETE RESTRICT,
  check_in date NOT NULL,
  check_out date NOT NULL,
  allocation_status text NOT NULL DEFAULT 'reserved'
    CHECK (allocation_status IN ('reserved','checked_in','released','reconciliation_required')),
  allocation_source text NOT NULL DEFAULT 'distribution'
    CHECK (allocation_source IN ('distribution','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
CREATE INDEX IF NOT EXISTS staynas_distribution_room_allocations_unit_dates_idx
  ON public.staynas_distribution_room_allocations(room_state_id,check_in,check_out)
  WHERE allocation_status IN ('reserved','checked_in');
CREATE INDEX IF NOT EXISTS staynas_distribution_room_allocations_property_idx
  ON public.staynas_distribution_room_allocations(organisation_id,property_id,check_in,check_out);

ALTER TABLE public.staynas_distribution_room_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_room_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staynas_distribution_room_allocations TO authenticated,service_role;
GRANT INSERT,UPDATE ON public.staynas_distribution_room_allocations TO service_role;
DROP POLICY IF EXISTS staynas_distribution_room_allocations_property_read
  ON public.staynas_distribution_room_allocations;
CREATE POLICY staynas_distribution_room_allocations_property_read
  ON public.staynas_distribution_room_allocations FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(),property_id));

-- Durable operational projection for traceability and repair. The source link
-- remains the identity authority; this row is a unique per-booking projection.
CREATE TABLE IF NOT EXISTS public.staynas_distribution_operational_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  reservation_link_id uuid NOT NULL UNIQUE
    REFERENCES public.staynas_distribution_reservation_links(id) ON DELETE RESTRICT,
  source_inbox_id uuid NOT NULL REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  provider_key text NOT NULL,
  external_reservation_id text NOT NULL,
  provider_status text NOT NULL,
  room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL,
  integration_status text NOT NULL
    CHECK (integration_status IN ('integrated','room_assignment_required','reconciliation_required')),
  last_provider_event_id text NOT NULL,
  last_integrated_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staynas_distribution_operational_property_idx
  ON public.staynas_distribution_operational_reservations(property_id,integration_status,last_integrated_at DESC);

-- Safe provider event history: one row per durable inbox event, with no raw or
-- normalized payload and no guest/payment secrets exposed to staff.
CREATE TABLE IF NOT EXISTS public.staynas_distribution_operational_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  reservation_link_id uuid NOT NULL
    REFERENCES public.staynas_distribution_reservation_links(id) ON DELETE RESTRICT,
  source_inbox_id uuid NOT NULL UNIQUE
    REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  provider_key text NOT NULL,
  external_reservation_id text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_status text,
  processing_status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  safe_error_summary text,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staynas_distribution_operational_events_booking_idx
  ON public.staynas_distribution_operational_events(property_id,booking_id,received_at DESC);
ALTER TABLE public.staynas_distribution_operational_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_operational_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staynas_distribution_operational_events TO authenticated,service_role;
GRANT INSERT,UPDATE ON public.staynas_distribution_operational_events TO service_role;
DROP POLICY IF EXISTS staynas_distribution_operational_events_property_read
  ON public.staynas_distribution_operational_events;
CREATE POLICY staynas_distribution_operational_events_property_read
  ON public.staynas_distribution_operational_events FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(),property_id));

ALTER TABLE public.staynas_distribution_operational_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_operational_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staynas_distribution_operational_reservations TO authenticated,service_role;
GRANT INSERT,UPDATE ON public.staynas_distribution_operational_reservations TO service_role;
DROP POLICY IF EXISTS staynas_distribution_operational_property_read
  ON public.staynas_distribution_operational_reservations;
CREATE POLICY staynas_distribution_operational_property_read
  ON public.staynas_distribution_operational_reservations FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(),property_id));

CREATE OR REPLACE FUNCTION public.staynas_sync_distribution_event_history(_inbox_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $function$
  WITH source AS MATERIALIZED (
    SELECT i.* FROM public.staynas_distribution_webhook_inbox i WHERE i.id=_inbox_id
  ),
  linked AS MATERIALIZED (
    SELECT l.id AS reservation_link_id,l.booking_id,l.organisation_id,l.property_id,
      l.provider_key,l.external_reservation_id,s.id AS source_inbox_id,
      s.provider_event_id,s.event_type,s.normalized_event->>'providerStatus' AS provider_status,
      s.processing_status,s.attempt_count,s.safe_error_summary,s.received_at,s.processed_at
    FROM source s
    JOIN public.staynas_distribution_reservation_links l
      ON l.organisation_id=s.organisation_id AND l.property_id=s.property_id
     AND l.connection_id=s.connection_id AND l.account_grant_id=s.account_grant_id
     AND l.external_account_id=s.external_account_id AND l.provider_key=s.provider_key
     AND l.environment=s.environment
     AND l.external_reservation_id=s.normalized_event->>'externalReservationId'
  ),
  upserted AS (
    INSERT INTO public.staynas_distribution_operational_events(
      organisation_id,property_id,booking_id,reservation_link_id,source_inbox_id,
      provider_key,external_reservation_id,provider_event_id,event_type,provider_status,
      processing_status,attempt_count,safe_error_summary,received_at,processed_at
    )
    SELECT organisation_id,property_id,booking_id,reservation_link_id,source_inbox_id,
      provider_key,external_reservation_id,provider_event_id,event_type,provider_status,
      processing_status,attempt_count,safe_error_summary,received_at,processed_at
    FROM linked
    ON CONFLICT(source_inbox_id) DO UPDATE SET
      provider_status=EXCLUDED.provider_status,
      processing_status=EXCLUDED.processing_status,
      attempt_count=EXCLUDED.attempt_count,
      safe_error_summary=EXCLUDED.safe_error_summary,
      processed_at=EXCLUDED.processed_at,
      updated_at=pg_catalog.now()
    RETURNING booking_id
  )
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM source)
      THEN jsonb_build_object('ok',false,'outcome','inbox_missing')
    WHEN NOT EXISTS(SELECT 1 FROM linked)
      THEN jsonb_build_object('ok',true,'outcome','unlinked')
    ELSE jsonb_build_object('ok',true,'outcome','recorded','booking_id',(SELECT booking_id FROM linked LIMIT 1))
  END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_sync_distribution_event_history(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_sync_distribution_event_history(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_distribution_event_history_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  PERFORM public.staynas_sync_distribution_event_history(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_distribution_event_history_sync_trigger()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_distribution_event_history_sync
  ON public.staynas_distribution_webhook_inbox;
CREATE TRIGGER staynas_distribution_event_history_sync
  AFTER INSERT OR UPDATE OF processing_status,attempt_count,safe_error_summary,processed_at
  ON public.staynas_distribution_webhook_inbox
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_event_history_sync_trigger();

-- Task and alert idempotency is booking-scoped. Replayed provider events cannot
-- create another arrival task or another unresolved room-assignment alert.
CREATE UNIQUE INDEX IF NOT EXISTS staynas_channel_arrival_task_booking_uidx
  ON public.ops_tasks(booking_id,task_type)
  WHERE booking_id IS NOT NULL AND task_type='channel_reservation_arrival';
CREATE UNIQUE INDEX IF NOT EXISTS staynas_channel_review_task_booking_uidx
  ON public.ops_tasks(booking_id,task_type)
  WHERE booking_id IS NOT NULL AND task_type='channel_reservation_review';
CREATE UNIQUE INDEX IF NOT EXISTS staynas_channel_room_alert_booking_uidx
  ON public.ops_alerts(booking_id,kind)
  WHERE booking_id IS NOT NULL AND kind='room_conflict' AND resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staynas_channel_reconciliation_task_booking_uidx
  ON public.ops_tasks(booking_id,task_type)
  WHERE booking_id IS NOT NULL AND task_type='channel_reservation_reconciliation';

-- Convert lifecycle/manual-reconciliation outcomes into a durable Operations
-- task and a visible exception state. This is invoked by the trusted server
-- worker after the canonical lifecycle RPC deliberately refuses an unsafe edit.
CREATE OR REPLACE FUNCTION public.staynas_mark_distribution_operational_reconciliation(
  _inbox_id uuid,
  _reconciliation_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_link public.staynas_distribution_reservation_links%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role' THEN
    RAISE EXCEPTION 'Operational reconciliation is service-only.' USING ERRCODE='42501';
  END IF;
  IF _reconciliation_code IS NULL OR length(_reconciliation_code) NOT BETWEEN 1 AND 96
     OR _reconciliation_code ~ '[^a-z0-9_]' THEN
    RAISE EXCEPTION 'Invalid operational reconciliation code.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_inbox FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id;
  IF v_inbox.id IS NULL THEN RAISE EXCEPTION 'Lifecycle inbox event not found.'; END IF;
  SELECT * INTO v_link FROM public.staynas_distribution_reservation_links l
  WHERE l.organisation_id=v_inbox.organisation_id AND l.property_id=v_inbox.property_id
    AND l.connection_id=v_inbox.connection_id AND l.account_grant_id=v_inbox.account_grant_id
    AND l.external_account_id=v_inbox.external_account_id AND l.provider_key=v_inbox.provider_key
    AND l.environment=v_inbox.environment
    AND l.external_reservation_id=v_inbox.normalized_event->>'externalReservationId'
  FOR UPDATE;
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'outcome','no_canonical_link');
  END IF;
  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id=v_link.booking_id AND b.property_id=v_link.property_id
  FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Canonical reservation scope is invalid.' USING ERRCODE='42501';
  END IF;

  UPDATE public.staynas_distribution_operational_reservations
  SET provider_status=COALESCE(v_inbox.normalized_event->>'providerStatus',provider_status),
      integration_status='reconciliation_required',
      last_provider_event_id=v_inbox.provider_event_id,
      last_integrated_at=pg_catalog.now(),
      last_error_code=_reconciliation_code,
      updated_at=pg_catalog.now()
  WHERE booking_id=v_booking.id AND property_id=v_booking.property_id;

  INSERT INTO public.ops_tasks(
    property_id,booking_id,task_type,category,title,description,priority,status,due_at
  ) VALUES(
    v_booking.property_id,v_booking.id,'channel_reservation_reconciliation','other',
    'Reconcile channel reservation '||v_booking.reference,
    'Provider lifecycle event requires review ('||_reconciliation_code||'). Canonical booking and payment state were not changed by this event.',
    1,'pending',pg_catalog.now()
  )
  ON CONFLICT (booking_id,task_type)
    WHERE booking_id IS NOT NULL AND task_type='channel_reservation_reconciliation'
  DO UPDATE SET description=EXCLUDED.description,status='pending',due_at=EXCLUDED.due_at;

  RETURN jsonb_build_object('ok',true,'outcome','reconciliation_required',
    'booking_id',v_booking.id,'reconciliation_code',_reconciliation_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_mark_distribution_operational_reconciliation(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_mark_distribution_operational_reconciliation(uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_allocate_distribution_physical_room(
  _booking_id uuid,
  _organisation_id uuid,
  _property_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_unit public.room_states%ROWTYPE;
  v_allocation uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    WHERE p.id=_property_id AND p.organisation_id=_organisation_id AND p.status='active'
  ) THEN
    RAISE EXCEPTION 'Distribution room allocation organisation/property scope is invalid.'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id=_booking_id AND b.property_id=_property_id
  FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Channel booking is outside the requested property scope.' USING ERRCODE='42501';
  END IF;

  SELECT a.id,a.room_state_id INTO v_allocation,v_unit.id
  FROM public.staynas_distribution_room_allocations a
  WHERE a.booking_id=v_booking.id
    AND a.organisation_id=_organisation_id
    AND a.property_id=_property_id
    AND a.allocation_status IN ('reserved','checked_in');
  IF v_allocation IS NOT NULL THEN RETURN v_unit.id; END IF;

  FOR v_unit IN
    SELECT rs.* FROM public.room_states rs
    WHERE rs.room_id=v_booking.room_id
      AND rs.state NOT IN ('maintenance','out_of_service')
      AND NOT EXISTS (
        SELECT 1 FROM public.staynas_distribution_room_allocations a
        WHERE a.room_state_id=rs.id
          AND a.allocation_status IN ('reserved','checked_in')
          AND daterange(a.check_in,a.check_out,'[)') &&
              daterange(v_booking.check_in,v_booking.check_out,'[)')
      )
    ORDER BY CASE rs.state WHEN 'vacant_clean' THEN 0 WHEN 'inspection' THEN 1
      WHEN 'vacant_dirty' THEN 2 ELSE 3 END,rs.unit_label,rs.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.staynas_distribution_room_allocations(
      organisation_id,property_id,booking_id,room_id,room_state_id,
      check_in,check_out,allocation_status,allocation_source
    ) VALUES (
      _organisation_id,_property_id,v_booking.id,v_booking.room_id,v_unit.id,
      v_booking.check_in,v_booking.check_out,
      CASE WHEN v_booking.status::text='checked_in' THEN 'checked_in' ELSE 'reserved' END,
      'distribution'
    )
    ON CONFLICT(booking_id) DO UPDATE
      SET room_id=EXCLUDED.room_id,room_state_id=EXCLUDED.room_state_id,
          check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,
          allocation_status=EXCLUDED.allocation_status,updated_at=pg_catalog.now()
      WHERE staynas_distribution_room_allocations.allocation_status='released'
    RETURNING id INTO v_allocation;
    IF v_allocation IS NOT NULL THEN RETURN v_unit.id; END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_allocate_distribution_physical_room(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_allocate_distribution_physical_room(uuid,uuid,uuid)
  TO service_role;

-- Bind the date-range assignment to the exact physical unit immediately before
-- staff check-in. The shared lifecycle core then performs its existing occupied
-- transition against this assigned unit rather than selecting an arbitrary unit.
CREATE OR REPLACE FUNCTION public.staynas_bind_distribution_room_for_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_allocation public.staynas_distribution_room_allocations%ROWTYPE;
  v_room_state public.room_states%ROWTYPE;
BEGIN
  IF NEW.source='channel' AND NEW.status::text='checked_in'
     AND OLD.status::text IS DISTINCT FROM NEW.status::text THEN
    SELECT * INTO v_allocation
    FROM public.staynas_distribution_room_allocations a
    WHERE a.booking_id=NEW.id AND a.property_id=NEW.property_id
      AND a.allocation_status='reserved'
      AND a.check_in=NEW.check_in AND a.check_out=NEW.check_out
    FOR UPDATE;
    IF v_allocation.id IS NULL THEN
      RAISE EXCEPTION 'Channel reservation requires a confirmed physical room assignment before check-in.'
        USING ERRCODE='55000';
    END IF;
    SELECT * INTO v_room_state FROM public.room_states rs
    WHERE rs.id=v_allocation.room_state_id AND rs.room_id=NEW.room_id
    FOR UPDATE;
    IF v_room_state.id IS NULL OR v_room_state.state NOT IN ('vacant_clean','inspection')
       OR v_room_state.booking_id IS NOT NULL THEN
      RAISE EXCEPTION 'Assigned physical room is not ready for check-in; housekeeping or reassignment is required.'
        USING ERRCODE='55000';
    END IF;
    UPDATE public.room_states
    SET booking_id=NEW.id,state='reserved'
    WHERE id=v_room_state.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_bind_distribution_room_for_checkin()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_distribution_room_checkin_binding ON public.bookings;
CREATE TRIGGER staynas_distribution_room_checkin_binding
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_bind_distribution_room_for_checkin();

CREATE OR REPLACE FUNCTION public.staynas_integrate_distribution_reservation(
  _reservation_link_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_link public.staynas_distribution_reservation_links%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_property public.staynas_properties%ROWTYPE;
  v_room_state_id uuid;
  v_status text;
  v_effective_status text;
  v_task_due timestamptz;
  v_integration_status text;
  v_error_code text;
BEGIN
  SELECT * INTO v_link FROM public.staynas_distribution_reservation_links l
  WHERE l.id=_reservation_link_id;
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'Distribution reservation link not found.';
  END IF;

  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id=v_link.booking_id AND b.property_id=v_link.property_id
  FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.source<>'channel' THEN
    RAISE EXCEPTION 'Canonical channel booking/property scope is invalid.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_property FROM public.staynas_properties p
  WHERE p.id=v_link.property_id AND p.organisation_id=v_link.organisation_id
    AND p.status='active';
  IF v_property.id IS NULL THEN
    RAISE EXCEPTION 'Distribution reservation organisation/property scope mismatch.' USING ERRCODE='42501';
  END IF;
  IF v_booking.guest_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.guests g WHERE g.id=v_booking.guest_id AND g.is_deleted=false
  ) THEN
    RAISE EXCEPTION 'Canonical channel booking has no linked guest profile.' USING ERRCODE='23514';
  END IF;

  v_status:=CASE lower(btrim(v_link.provider_status))
    WHEN 'pending' THEN 'pending'
    WHEN 'requested' THEN 'pending'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'booked' THEN 'confirmed'
    WHEN 'accepted' THEN 'confirmed'
    ELSE NULL END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Unsupported provider reservation state for operational integration.';
  END IF;

  -- Confirmation is a reservation state only. Payment and check-in state are
  -- never inferred from a provider event. Pending reservations do not consume a
  -- physical room assignment until the provider confirms them.
  UPDATE public.bookings
  SET status=CASE
    WHEN status::text='pending' THEN v_status::public.booking_status
    ELSE status
  END
  WHERE id=v_booking.id AND property_id=v_link.property_id;
  v_effective_status:=CASE
    WHEN v_booking.status::text='pending' THEN v_status
    ELSE v_booking.status::text
  END;

  v_room_state_id:=NULL;
  v_error_code:=NULL;
  IF v_effective_status='pending' THEN
    v_integration_status:='integrated';
    INSERT INTO public.ops_tasks(
      property_id,booking_id,task_type,category,title,description,priority,status,due_at
    ) VALUES (
      v_link.property_id,v_booking.id,'channel_reservation_review','other',
      'Review pending channel reservation '||v_booking.reference,
      'Provider reservation is pending confirmation. Verify its state before assigning a physical room.',
      2,'pending',pg_catalog.now()
    )
    ON CONFLICT (booking_id,task_type)
      WHERE booking_id IS NOT NULL AND task_type='channel_reservation_review'
    DO UPDATE SET description=EXCLUDED.description,status='pending',due_at=EXCLUDED.due_at;
  ELSIF v_effective_status IN ('confirmed','checked_in') THEN
    v_room_state_id:=public.staynas_allocate_distribution_physical_room(
      v_booking.id,v_link.organisation_id,v_link.property_id
    );
    IF v_effective_status='confirmed' THEN
      v_task_due:=((v_booking.check_in::timestamp + time '09:00')
        AT TIME ZONE COALESCE(NULLIF(v_property.timezone,''),'Africa/Dar_es_Salaam'));
      INSERT INTO public.ops_tasks(
        property_id,booking_id,room_state_id,task_type,category,title,description,
        priority,status,due_at
      ) VALUES (
        v_link.property_id,v_booking.id,v_room_state_id,'channel_reservation_arrival','other',
        'Prepare channel reservation '||v_booking.reference,
        'Verify guest details, confirm arrival arrangements and review the allocated room before check-in.',
        2,'pending',v_task_due
      )
      ON CONFLICT (booking_id,task_type)
        WHERE booking_id IS NOT NULL AND task_type='channel_reservation_arrival'
      DO UPDATE SET room_state_id=EXCLUDED.room_state_id,
        description=EXCLUDED.description,due_at=EXCLUDED.due_at;
      UPDATE public.ops_tasks SET status='cancelled'
      WHERE booking_id=v_booking.id AND task_type='channel_reservation_review'
        AND status IN ('pending','in_progress');
    END IF;
    IF v_room_state_id IS NULL THEN
      v_integration_status:='room_assignment_required';
      v_error_code:='physical_room_assignment_required';
      INSERT INTO public.ops_alerts(property_id,kind,severity,booking_id,room_id,message)
      VALUES(v_link.property_id,'room_conflict','warning',v_booking.id,v_booking.room_id,
        'Channel reservation requires physical room assignment before arrival.')
      ON CONFLICT (booking_id,kind)
        WHERE booking_id IS NOT NULL AND kind='room_conflict' AND resolved_at IS NULL
      DO NOTHING;
    ELSE
      v_integration_status:='integrated';
    END IF;
  ELSE
    v_integration_status:='integrated';
  END IF;

  INSERT INTO public.staynas_distribution_operational_reservations(
    organisation_id,property_id,booking_id,reservation_link_id,source_inbox_id,
    provider_key,external_reservation_id,provider_status,room_state_id,
    integration_status,last_provider_event_id,last_integrated_at,last_error_code
  ) VALUES (
    v_link.organisation_id,v_link.property_id,v_booking.id,v_link.id,v_link.source_inbox_id,
    v_link.provider_key,v_link.external_reservation_id,v_link.provider_status,v_room_state_id,
    v_integration_status,v_link.source_provider_event_id,pg_catalog.now(),
    v_error_code
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    provider_status=EXCLUDED.provider_status,
    room_state_id=EXCLUDED.room_state_id,
    integration_status=EXCLUDED.integration_status,
    last_integrated_at=pg_catalog.now(),
    last_error_code=EXCLUDED.last_error_code,
    updated_at=pg_catalog.now();

  PERFORM public.staynas_sync_distribution_event_history(v_link.source_inbox_id);

  RETURN jsonb_build_object(
    'ok',true,'booking_id',v_booking.id,'guest_id',v_booking.guest_id,
    'room_state_id',v_room_state_id,'integration_status',v_integration_status,
    'payment_status',v_booking.payment_status,'check_in_started',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_integrate_distribution_reservation(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_integrate_distribution_reservation(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_distribution_reservation_link_operational_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  PERFORM public.staynas_integrate_distribution_reservation(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_distribution_reservation_link_operational_sync()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_distribution_reservation_link_operational_sync
  ON public.staynas_distribution_reservation_links;
CREATE TRIGGER staynas_distribution_reservation_link_operational_sync
  AFTER INSERT ON public.staynas_distribution_reservation_links
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_reservation_link_operational_sync();

-- Release date-range allocations when a stay ends or is cancelled/no-show.
-- The existing shared lifecycle core remains the sole booking-state authority;
-- this trigger only reconciles its operational projection.
CREATE OR REPLACE FUNCTION public.staynas_reconcile_distribution_booking_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_link public.staynas_distribution_reservation_links%ROWTYPE;
  v_property public.staynas_properties%ROWTYPE;
  v_room_state_id uuid;
  v_due_at timestamptz;
  v_integration_status text;
  v_error_code text;
BEGIN
  IF NEW.status::text='confirmed' AND OLD.status::text='pending' AND NEW.source='channel' THEN
    SELECT * INTO v_link FROM public.staynas_distribution_reservation_links l
    WHERE l.booking_id=NEW.id AND l.property_id=NEW.property_id
    FOR UPDATE;
    IF v_link.id IS NOT NULL THEN
      v_room_state_id:=public.staynas_allocate_distribution_physical_room(
        NEW.id,v_link.organisation_id,v_link.property_id
      );
      SELECT * INTO v_property FROM public.staynas_properties p
      WHERE p.id=v_link.property_id AND p.organisation_id=v_link.organisation_id;
      v_due_at:=((NEW.check_in::timestamp+time '09:00')
        AT TIME ZONE COALESCE(NULLIF(v_property.timezone,''),'Africa/Dar_es_Salaam'));
      INSERT INTO public.ops_tasks(
        property_id,booking_id,room_state_id,task_type,category,title,description,
        priority,status,due_at
      ) VALUES (
        NEW.property_id,NEW.id,v_room_state_id,'channel_reservation_arrival','other',
        'Prepare channel reservation '||NEW.reference,
        'Verify guest details, confirm arrival arrangements and review the allocated room before check-in.',
        2,'pending',v_due_at
      )
      ON CONFLICT (booking_id,task_type)
        WHERE booking_id IS NOT NULL AND task_type='channel_reservation_arrival'
      DO UPDATE SET room_state_id=EXCLUDED.room_state_id,
        description=EXCLUDED.description,due_at=EXCLUDED.due_at;
      UPDATE public.ops_tasks SET status='cancelled'
      WHERE booking_id=NEW.id AND task_type='channel_reservation_review'
        AND status IN ('pending','in_progress');
      IF v_room_state_id IS NULL THEN
        v_integration_status:='room_assignment_required';
        v_error_code:='physical_room_assignment_required';
        INSERT INTO public.ops_alerts(property_id,kind,severity,booking_id,room_id,message)
        VALUES(NEW.property_id,'room_conflict','warning',NEW.id,NEW.room_id,
          'Confirmed channel reservation requires physical room assignment before arrival.')
        ON CONFLICT (booking_id,kind)
          WHERE booking_id IS NOT NULL AND kind='room_conflict' AND resolved_at IS NULL
        DO NOTHING;
      ELSE
        v_integration_status:='integrated';
        UPDATE public.ops_alerts SET resolved_at=pg_catalog.now()
        WHERE booking_id=NEW.id AND kind='room_conflict' AND resolved_at IS NULL;
      END IF;
      UPDATE public.staynas_distribution_operational_reservations
      SET room_state_id=v_room_state_id,integration_status=v_integration_status,
          last_error_code=v_error_code,updated_at=pg_catalog.now()
      WHERE booking_id=NEW.id AND property_id=NEW.property_id;
    END IF;
  ELSIF NEW.status::text IN ('cancelled','no_show','completed') THEN
    UPDATE public.staynas_distribution_room_allocations
    SET allocation_status='released',updated_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND property_id=NEW.property_id
      AND allocation_status IN ('reserved','checked_in');
    UPDATE public.staynas_distribution_operational_reservations
    SET integration_status='integrated',room_state_id=NULL,
        last_error_code=NULL,updated_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND property_id=NEW.property_id;
    UPDATE public.ops_tasks SET status='cancelled'
    WHERE booking_id=NEW.id
      AND task_type IN ('channel_reservation_arrival','channel_reservation_review')
      AND status IN ('pending','in_progress');
    UPDATE public.ops_alerts SET resolved_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND kind='room_conflict' AND resolved_at IS NULL;
  ELSIF NEW.status::text='checked_in' THEN
    UPDATE public.staynas_distribution_room_allocations
    SET allocation_status='checked_in',updated_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND property_id=NEW.property_id
      AND allocation_status='reserved';
    UPDATE public.ops_tasks
    SET status='completed',completed_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND task_type='channel_reservation_arrival'
      AND status IN ('pending','in_progress');
    UPDATE public.ops_alerts SET resolved_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND kind='room_conflict' AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_reconcile_distribution_booking_operations()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_distribution_booking_operational_reconcile ON public.bookings;
CREATE TRIGGER staynas_distribution_booking_operational_reconcile
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.staynas_reconcile_distribution_booking_operations();


-- Provider lifecycle updates refresh the operational source projection without
-- replaying the initial booking materialization or changing payment state.
CREATE OR REPLACE FUNCTION public.staynas_distribution_reservation_link_lifecycle_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  UPDATE public.staynas_distribution_operational_reservations
  SET provider_status=NEW.provider_status,
      last_provider_event_id=COALESCE(NEW.last_provider_event_id,NEW.source_provider_event_id),
      last_integrated_at=COALESCE(NEW.last_lifecycle_applied_at,pg_catalog.now()),
      updated_at=pg_catalog.now()
  WHERE reservation_link_id=NEW.id
    AND organisation_id=NEW.organisation_id
    AND property_id=NEW.property_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_distribution_reservation_link_lifecycle_sync()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staynas_distribution_reservation_link_lifecycle_sync
  ON public.staynas_distribution_reservation_links;
CREATE TRIGGER staynas_distribution_reservation_link_lifecycle_sync
  AFTER UPDATE OF provider_status,last_provider_event_id,last_lifecycle_event_type,last_lifecycle_applied_at
  ON public.staynas_distribution_reservation_links
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_reservation_link_lifecycle_sync();

-- DC-05.04 deliberately failed reinstatement closed. DC-05.07 adds a controlled
-- reinstatement path that restores canonical inventory and the physical-room
-- schedule atomically, while preserving the existing lifecycle worker contract.
DO $rename$
BEGIN
  IF to_regprocedure('public.staynas_apply_distribution_reservation_lifecycle(uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text)') IS NOT NULL
     AND to_regprocedure('public.staynas_apply_distribution_reservation_lifecycle_dc0504_base(uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
      uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
    ) RENAME TO staynas_apply_distribution_reservation_lifecycle_dc0504_base;
  END IF;
END
$rename$;

CREATE OR REPLACE FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  _inbox_id uuid,
  _lease_token uuid,
  _worker_id text,
  _payload_fingerprint text,
  _external_reservation_id text,
  _event_type text,
  _provider_event_id text,
  _provider_status text,
  _provider_modified_at timestamptz,
  _arrival_date date,
  _departure_date date,
  _adults integer,
  _children integer,
  _guest_name text DEFAULT NULL,
  _guest_email text DEFAULT NULL,
  _guest_phone text DEFAULT NULL,
  _country text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_link public.staynas_distribution_reservation_links%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_connection public.staynas_distribution_connections%ROWTYPE;
  v_source_event jsonb;
  v_property public.staynas_properties%ROWTYPE;
  v_room_state_id uuid;
  v_day date;
  v_available integer;
  v_blocked boolean;
  v_holds integer;
  v_due_at timestamptz;
  v_integration_status text;
BEGIN
  IF _event_type IS DISTINCT FROM 'reservation.reinstated' THEN
    RETURN public.staynas_apply_distribution_reservation_lifecycle_dc0504_base(
      _inbox_id,_lease_token,_worker_id,_payload_fingerprint,_external_reservation_id,
      _event_type,_provider_event_id,_provider_status,_provider_modified_at,
      _arrival_date,_departure_date,_adults,_children,_guest_name,_guest_email,_guest_phone,_country
    );
  END IF;

  IF COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role' THEN
    RAISE EXCEPTION 'Reservation reinstatement is service-only.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_inbox FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id AND i.processing_status='processing'
    AND i.lease_token=_lease_token AND i.lease_owner=_worker_id
    AND i.lease_expires_at>pg_catalog.now()
  FOR UPDATE;
  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'Reservation lifecycle lease is not current.' USING ERRCODE='42501';
  END IF;
  IF _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR NOT EXISTS(SELECT 1 FROM public.staynas_distribution_reservation_payloads p
       WHERE p.inbox_id=v_inbox.id AND p.payload_fingerprint=_payload_fingerprint)
     OR _provider_event_id IS DISTINCT FROM v_inbox.provider_event_id
     OR _event_type IS DISTINCT FROM v_inbox.event_type
     OR _external_reservation_id IS DISTINCT FROM v_inbox.normalized_event->>'externalReservationId'
     OR _arrival_date IS DISTINCT FROM (v_inbox.normalized_event->>'arrivalDate')::date
     OR _departure_date IS DISTINCT FROM (v_inbox.normalized_event->>'departureDate')::date
     OR _adults IS DISTINCT FROM (v_inbox.normalized_event->>'adults')::integer
     OR _children IS DISTINCT FROM COALESCE((v_inbox.normalized_event->>'children')::integer,0)
     OR _provider_status IS DISTINCT FROM v_inbox.normalized_event->>'providerStatus'
     OR _provider_modified_at IS DISTINCT FROM NULLIF(v_inbox.normalized_event->>'providerModifiedAt','')::timestamptz THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','reservation_payload_mismatch');
  END IF;
  IF _provider_modified_at IS NULL
     OR lower(btrim(COALESCE(_provider_status,''))) NOT IN ('confirmed','booked','accepted') THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','invalid_reinstatement_state');
  END IF;

  SELECT c.* INTO v_connection
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key AND g.environment=c.environment
  WHERE c.id=v_inbox.connection_id AND c.organisation_id=v_inbox.organisation_id
    AND c.property_id=v_inbox.property_id AND c.account_grant_id=v_inbox.account_grant_id
    AND c.external_account_id=v_inbox.external_account_id AND c.provider_key=v_inbox.provider_key
    AND c.environment=v_inbox.environment AND c.lifecycle='connected'
    AND g.grant_status='active' AND 'reservation.update'=ANY(g.granted_capabilities);
  IF v_connection.id IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','connection_grant_inactive');
  END IF;

  SELECT * INTO v_link FROM public.staynas_distribution_reservation_links l
  WHERE l.provider_key=v_inbox.provider_key AND l.external_account_id=v_inbox.external_account_id
    AND l.external_reservation_id=_external_reservation_id
    AND l.organisation_id=v_inbox.organisation_id AND l.property_id=v_inbox.property_id
    AND l.connection_id=v_inbox.connection_id AND l.account_grant_id=v_inbox.account_grant_id
  FOR UPDATE;
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','canonical_reservation_link_missing');
  END IF;
  SELECT i.normalized_event INTO v_source_event
  FROM public.staynas_distribution_webhook_inbox i WHERE i.id=v_link.source_inbox_id;
  IF v_source_event IS NULL
     OR v_inbox.normalized_event->>'externalListingId' IS DISTINCT FROM v_source_event->>'externalListingId'
     OR v_inbox.normalized_event->>'externalRoomId' IS DISTINCT FROM v_source_event->>'externalRoomId'
     OR v_inbox.normalized_event->>'externalRatePlanId' IS DISTINCT FROM v_source_event->>'externalRatePlanId' THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','room_or_rate_plan_change_requires_reallocation');
  END IF;

  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id=v_link.booking_id AND b.property_id=v_link.property_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','canonical_booking_missing');
  END IF;
  IF v_booking.status::text NOT IN ('cancelled','no_show') THEN
    RETURN jsonb_build_object('outcome','no_lifecycle_change','reason','reservation_not_cancelled');
  END IF;
  IF v_link.provider_modified_at IS NOT NULL AND _provider_modified_at<=v_link.provider_modified_at THEN
    RETURN jsonb_build_object('outcome','no_lifecycle_change','reason','stale_provider_event');
  END IF;
  IF _arrival_date IS DISTINCT FROM v_booking.check_in
     OR _departure_date IS DISTINCT FROM v_booking.check_out
     OR _adults IS DISTINCT FROM v_booking.adults
     OR _children IS DISTINCT FROM v_booking.children THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','stay_change_requires_reallocation');
  END IF;

  -- Reacquire canonical room inventory in date order and account for active holds.
  PERFORM public.staynas_lock_room_inventory_dates(
    v_booking.room_id,v_booking.property_id,v_booking.check_in,v_booking.check_out
  );
  v_day:=v_booking.check_in;
  WHILE v_day<v_booking.check_out LOOP
    SELECT ri.available_units,ri.is_blocked,
      (SELECT count(*)::integer FROM public.booking_holds h
       WHERE h.room_id=v_booking.room_id AND h.property_id=v_booking.property_id
         AND h.status='active' AND h.expires_at>pg_catalog.now()
         AND h.check_in<=v_day AND h.check_out>v_day)
    INTO v_available,v_blocked,v_holds
    FROM public.room_inventory ri
    WHERE ri.room_id=v_booking.room_id AND ri.date=v_day
    FOR UPDATE;
    IF v_blocked OR v_available-COALESCE(v_holds,0)<=0 THEN
      RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','reinstatement_inventory_unavailable');
    END IF;
    v_day:=v_day+1;
  END LOOP;
  UPDATE public.room_inventory ri
  SET available_units=ri.available_units-1,updated_at=pg_catalog.now()
  WHERE ri.room_id=v_booking.room_id AND ri.date>=v_booking.check_in
    AND ri.date<v_booking.check_out AND ri.available_units>0;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','reinstatement_inventory_unavailable');
  END IF;

  UPDATE public.bookings
  SET status='confirmed'::public.booking_status,
      guest_name=COALESCE(NULLIF(btrim(_guest_name),''),guest_name),
      guest_email=COALESCE(NULLIF(btrim(_guest_email),''),guest_email),
      guest_phone=COALESCE(NULLIF(btrim(_guest_phone),''),guest_phone),
      country=COALESCE(NULLIF(btrim(_country),''),country)
  WHERE id=v_booking.id AND property_id=v_booking.property_id;

  v_room_state_id:=public.staynas_allocate_distribution_physical_room(
    v_booking.id,v_link.organisation_id,v_link.property_id
  );
  SELECT * INTO v_property FROM public.staynas_properties p
  WHERE p.id=v_link.property_id AND p.organisation_id=v_link.organisation_id;
  v_due_at:=((v_booking.check_in::timestamp+time '09:00')
    AT TIME ZONE COALESCE(NULLIF(v_property.timezone,''),'Africa/Dar_es_Salaam'));

  INSERT INTO public.ops_tasks(
    property_id,booking_id,room_state_id,task_type,category,title,description,
    priority,status,due_at,completed_at
  ) VALUES (
    v_link.property_id,v_booking.id,v_room_state_id,'channel_reservation_arrival','other',
    'Prepare channel reservation '||v_booking.reference,
    'Verify guest details, confirm arrival arrangements and review the allocated room before check-in.',
    2,'pending',v_due_at,NULL
  )
  ON CONFLICT (booking_id,task_type)
    WHERE booking_id IS NOT NULL AND task_type='channel_reservation_arrival'
  DO UPDATE SET room_state_id=EXCLUDED.room_state_id,status='pending',
    completed_at=NULL,due_at=EXCLUDED.due_at,description=EXCLUDED.description;

  IF v_room_state_id IS NULL THEN
    v_integration_status:='room_assignment_required';
    INSERT INTO public.ops_alerts(property_id,kind,severity,booking_id,room_id,message)
    VALUES(v_link.property_id,'room_conflict','warning',v_booking.id,v_booking.room_id,
      'Reinstated channel reservation requires physical room assignment before arrival.')
    ON CONFLICT (booking_id,kind)
      WHERE booking_id IS NOT NULL AND kind='room_conflict' AND resolved_at IS NULL
    DO NOTHING;
  ELSE
    v_integration_status:='integrated';
    UPDATE public.ops_alerts SET resolved_at=pg_catalog.now()
    WHERE booking_id=v_booking.id AND kind='room_conflict' AND resolved_at IS NULL;
  END IF;

  UPDATE public.staynas_distribution_reservation_links
  SET provider_status=_provider_status,provider_modified_at=_provider_modified_at,
      last_provider_event_id=_provider_event_id,last_lifecycle_event_type=_event_type,
      last_lifecycle_applied_at=pg_catalog.now()
  WHERE id=v_link.id;

  UPDATE public.staynas_distribution_operational_reservations
  SET provider_status=_provider_status,room_state_id=v_room_state_id,
      integration_status=v_integration_status,last_provider_event_id=_provider_event_id,
      last_integrated_at=pg_catalog.now(),
      last_error_code=CASE WHEN v_room_state_id IS NULL
        THEN 'physical_room_assignment_required' ELSE NULL END,
      updated_at=pg_catalog.now()
  WHERE booking_id=v_booking.id AND property_id=v_booking.property_id;

  RETURN jsonb_build_object('outcome','applied','booking_id',v_booking.id,
    'status','confirmed','duplicate',false,'room_state_id',v_room_state_id,
    'integration_status',v_integration_status,'payment_status',v_booking.payment_status,
    'check_in_started',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) TO service_role;

-- Provider financial evidence remains a read-only finance evidence surface.
-- It is never copied into payment, refund, folio or cash-ledger tables.
GRANT SELECT ON public.staynas_distribution_financial_evidence TO authenticated;
DROP POLICY IF EXISTS staynas_distribution_financial_evidence_property_read
  ON public.staynas_distribution_financial_evidence;
CREATE POLICY staynas_distribution_financial_evidence_property_read
  ON public.staynas_distribution_financial_evidence FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(),property_id));

COMMIT;
