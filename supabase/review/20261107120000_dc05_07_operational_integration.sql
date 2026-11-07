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
ALTER TABLE public.staynas_distribution_operational_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_operational_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staynas_distribution_operational_reservations TO authenticated,service_role;
GRANT INSERT,UPDATE ON public.staynas_distribution_operational_reservations TO service_role;
CREATE POLICY staynas_distribution_operational_property_read
  ON public.staynas_distribution_operational_reservations FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(),property_id));

-- Task and alert idempotency is booking-scoped. Replayed provider events cannot
-- create another arrival task or another unresolved room-assignment alert.
CREATE UNIQUE INDEX IF NOT EXISTS staynas_channel_arrival_task_booking_uidx
  ON public.ops_tasks(booking_id,task_type)
  WHERE booking_id IS NOT NULL AND task_type='channel_reservation_arrival';
CREATE UNIQUE INDEX IF NOT EXISTS staynas_channel_room_alert_booking_uidx
  ON public.ops_alerts(booking_id,kind)
  WHERE booking_id IS NOT NULL AND kind='room_conflict' AND resolved_at IS NULL;

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
      AND rs.state IN ('vacant_clean','inspection')
      AND rs.booking_id IS NULL
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
  v_task_due timestamptz;
  v_integration_status text;
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

  -- Confirmation is a reservation state only. Payment remains unpaid and no
  -- check-in state is created by a provider confirmation.
  UPDATE public.bookings
  SET status=v_status::public.booking_status,
      source='channel',
      payment_status='unpaid',
      payment_method=NULL,
      payment_provider='channel',
      deposit_amount=0,
      balance_amount=total,
      balance_due=total
  WHERE id=v_booking.id AND property_id=v_link.property_id;

  v_room_state_id:=public.staynas_allocate_distribution_physical_room(
    v_booking.id,v_link.organisation_id,v_link.property_id
  );

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

  IF v_room_state_id IS NULL THEN
    v_integration_status:='room_assignment_required';
    INSERT INTO public.ops_alerts(kind,severity,booking_id,room_id,message)
    VALUES('room_conflict','warning',v_booking.id,v_booking.room_id,
      'Channel reservation requires physical room assignment before arrival.')
    ON CONFLICT (booking_id,kind)
      WHERE booking_id IS NOT NULL AND kind='room_conflict' AND resolved_at IS NULL
    DO NOTHING;
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
    CASE WHEN v_room_state_id IS NULL THEN 'physical_room_assignment_required' ELSE NULL END
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    provider_status=EXCLUDED.provider_status,
    room_state_id=COALESCE(EXCLUDED.room_state_id,staynas_distribution_operational_reservations.room_state_id),
    integration_status=CASE WHEN EXCLUDED.room_state_id IS NULL
      THEN 'room_assignment_required' ELSE 'integrated' END,
    last_provider_event_id=EXCLUDED.last_provider_event_id,
    last_integrated_at=pg_catalog.now(),
    last_error_code=EXCLUDED.last_error_code,
    updated_at=pg_catalog.now();

  RETURN jsonb_build_object(
    'ok',true,'booking_id',v_booking.id,'guest_id',v_booking.guest_id,
    'room_state_id',v_room_state_id,'integration_status',v_integration_status,
    'payment_status','unpaid','check_in_started',false
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
BEGIN
  IF NEW.status::text IN ('cancelled','no_show','completed') THEN
    UPDATE public.staynas_distribution_room_allocations
    SET allocation_status='released',updated_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND property_id=NEW.property_id
      AND allocation_status IN ('reserved','checked_in');
    UPDATE public.staynas_distribution_operational_reservations
    SET integration_status='integrated',room_state_id=NULL,
        last_error_code=NULL,updated_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND property_id=NEW.property_id;
    UPDATE public.ops_tasks
    SET status='cancelled'
    WHERE booking_id=NEW.id AND task_type='channel_reservation_arrival'
      AND status IN ('pending','in_progress');
  ELSIF NEW.status::text='checked_in' THEN
    UPDATE public.staynas_distribution_room_allocations
    SET allocation_status='checked_in',updated_at=pg_catalog.now()
    WHERE booking_id=NEW.id AND property_id=NEW.property_id
      AND allocation_status='reserved';
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

-- Provider financial evidence remains a read-only finance evidence surface.
-- It is never copied into payment, refund, folio or cash-ledger tables.
GRANT SELECT ON public.staynas_distribution_financial_evidence TO authenticated;
DROP POLICY IF EXISTS staynas_distribution_financial_evidence_property_read
  ON public.staynas_distribution_financial_evidence;
CREATE POLICY staynas_distribution_financial_evidence_property_read
  ON public.staynas_distribution_financial_evidence FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(),property_id));

COMMIT;
