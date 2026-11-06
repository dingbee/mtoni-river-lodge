-- Idempotency ledger reusing activity_logs (no new automation tables)
CREATE UNIQUE INDEX IF NOT EXISTS activity_logs_arrival_automation_key
  ON public.activity_logs (action, entity_id)
  WHERE module = 'arrival-automation';

CREATE OR REPLACE FUNCTION public.arrival_automation_run(
  _event text,
  _booking_id uuid,
  _meta jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _b record;
  _checkin_id uuid;
  _prev_stays int := 0;
  _docs int := 0;
  _unit text;
BEGIN
  IF _booking_id IS NULL OR _event IS NULL THEN
    RETURN false;
  END IF;

  -- Idempotency claim: one automation run per (event, booking).
  BEGIN
    INSERT INTO public.activity_logs (action, entity_type, entity_id, module, severity, metadata)
    VALUES ('arrival.automation.' || _event, 'booking', _booking_id, 'arrival-automation', 'audit',
            COALESCE(_meta, '{}'::jsonb) || jsonb_build_object('event', _event));
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;

  SELECT b.id, b.reference, b.guest_name, b.guest_id, b.check_in, b.check_out, b.nights,
         b.room_id, b.status, b.payment_status, b.special_requests, r.name AS room_name
    INTO _b
  FROM public.bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = _booking_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT id INTO _checkin_id FROM public.guest_checkins WHERE booking_id = _booking_id LIMIT 1;
  SELECT count(*) INTO _docs FROM public.guest_documents WHERE booking_id = _booking_id;
  SELECT unit_label INTO _unit FROM public.room_states WHERE booking_id = _booking_id LIMIT 1;

  IF _event = 'checkin_completed' THEN
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'reception', 'arrival_checkin_completed',
            'Online check-in completed — ' || _b.guest_name,
            _b.reference || ' · arriving ' || _b.check_in || ' · ' || COALESCE(_b.room_name, 'room TBA'),
            '/admin/operations/arrivals/' || _booking_id::text,
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));

    IF _docs = 0 THEN
      INSERT INTO public.ops_tasks (booking_id, task_type, category, title, description, priority)
      VALUES (_booking_id, 'front_desk', 'arrivals',
              'Collect identity documents — ' || _b.reference,
              'Online check-in was completed without identity documents. Collect and verify on arrival.', 1);
      INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
      VALUES ('in_app', 'manager', 'arrival_missing_documents',
              'Missing documents — ' || _b.guest_name,
              'Check-in submitted with no identity documents for ' || _b.reference || '.',
              '/admin/operations/arrivals/' || _booking_id::text,
              jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));
    END IF;

  ELSIF _event = 'arrival_confirmed' THEN
    -- Housekeeping
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'housekeeping', 'arrival_room_occupied',
            'Room occupied — ' || COALESCE(_unit, _b.room_name, 'room'),
            _b.guest_name || ' has arrived (' || _b.reference || '), departing ' || _b.check_out || '.',
            '/admin/operations/housekeeping',
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));
    INSERT INTO public.ops_tasks (booking_id, task_type, category, title, description, priority)
    VALUES (_booking_id, 'housekeeping', 'arrivals',
            'Arrival service — ' || COALESCE(_unit, _b.room_name, _b.reference),
            'Guest has checked in. Complete arrival turndown and amenity set-up.', 2);

    -- Front desk
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'reception', 'arrival_completed',
            'Arrival completed — ' || _b.guest_name,
            _b.reference || ' checked in to ' || COALESCE(_unit, _b.room_name, 'room') || '.',
            '/admin/operations/arrivals/' || _booking_id::text,
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));

    -- Management visibility
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'manager', 'arrival_completed',
            'Guest arrived — ' || _b.guest_name,
            _b.reference || ' · ' || COALESCE(_b.room_name, 'room') || ' · ' || _b.nights || ' nights.',
            '/admin/operations/arrivals',
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));

    -- Guest lifecycle (no duplicate guest logic — updates the existing profile)
    IF _b.guest_id IS NOT NULL THEN
      SELECT count(*) INTO _prev_stays
      FROM public.bookings
      WHERE guest_id = _b.guest_id
        AND id <> _booking_id
        AND status IN ('checked_in', 'completed');
      UPDATE public.guests g
         SET status = CASE WHEN _prev_stays > 0 THEN 'returning'::guest_status ELSE g.status END,
             updated_at = now()
       WHERE g.id = _b.guest_id
         AND g.status_override = false
         AND g.status <> 'vip';
    END IF;

  ELSIF _event = 'room_occupied' THEN
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'housekeeping', 'arrival_room_state',
            'Room state → occupied — ' || COALESCE(_unit, _b.room_name, 'room'),
            'Occupancy updated for ' || _b.reference || '.',
            '/admin/operations/housekeeping',
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));

  ELSIF _event = 'document_verified' THEN
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'reception', 'arrival_document_verified',
            'Identity document verified — ' || _b.guest_name,
            'First document verified for ' || _b.reference || '.',
            '/admin/operations/arrivals/' || _booking_id::text,
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));

  ELSIF _event = 'reservation_updated' THEN
    INSERT INTO public.notifications (channel, role, kind, title, body, href, meta)
    VALUES ('in_app', 'reception', 'arrival_reservation_changed',
            'Arrival reservation changed — ' || _b.guest_name,
            _b.reference || ' now arriving ' || _b.check_in || '.',
            '/admin/operations/arrivals/' || _booking_id::text,
            jsonb_build_object('booking_id', _booking_id, 'event', _event, 'source', 'arrival-automation'));
  END IF;

  -- Guest operational timeline (existing check-in activity log)
  IF _checkin_id IS NOT NULL THEN
    INSERT INTO public.guest_checkin_activity (checkin_id, booking_id, action, detail)
    VALUES (_checkin_id, _booking_id, 'automation_' || _event,
            COALESCE(_meta, '{}'::jsonb) || jsonb_build_object('source', 'arrival-automation'));
  END IF;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.arrival_automation_run(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrival_automation_run(text, uuid, jsonb) TO authenticated, service_role;

-- Trigger: online check-in completed
CREATE OR REPLACE FUNCTION public.trg_arrival_checkin_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $t$
BEGIN
  IF NEW.status IN ('submitted', 'under_review', 'approved')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.arrival_automation_run('checkin_completed', NEW.booking_id,
      jsonb_build_object('checkin_id', NEW.id, 'checkin_status', NEW.status));
  END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS arrival_checkin_completed ON public.guest_checkins;
CREATE TRIGGER arrival_checkin_completed
AFTER INSERT OR UPDATE OF status ON public.guest_checkins
FOR EACH ROW EXECUTE FUNCTION public.trg_arrival_checkin_completed();

-- Trigger: arrival confirmed (reservation lifecycle)
CREATE OR REPLACE FUNCTION public.trg_arrival_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $t$
BEGIN
  IF NEW.status = 'checked_in' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.arrival_automation_run('arrival_confirmed', NEW.id,
      jsonb_build_object('reference', NEW.reference));
  ELSIF NEW.status IN ('confirmed','pending')
        AND (OLD.check_in IS DISTINCT FROM NEW.check_in OR OLD.room_id IS DISTINCT FROM NEW.room_id) THEN
    PERFORM public.arrival_automation_run('reservation_updated', NEW.id,
      jsonb_build_object('reference', NEW.reference));
  END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS arrival_reservation_lifecycle ON public.bookings;
CREATE TRIGGER arrival_reservation_lifecycle
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_arrival_confirmed();

-- Trigger: room occupied
CREATE OR REPLACE FUNCTION public.trg_arrival_room_occupied()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $t$
BEGIN
  IF NEW.state = 'occupied' AND OLD.state IS DISTINCT FROM NEW.state AND NEW.booking_id IS NOT NULL THEN
    PERFORM public.arrival_automation_run('room_occupied', NEW.booking_id,
      jsonb_build_object('unit_label', NEW.unit_label, 'room_id', NEW.room_id));
  END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS arrival_room_occupied ON public.room_states;
CREATE TRIGGER arrival_room_occupied
AFTER UPDATE OF state ON public.room_states
FOR EACH ROW EXECUTE FUNCTION public.trg_arrival_room_occupied();

-- Trigger: identity document verified
CREATE OR REPLACE FUNCTION public.trg_arrival_document_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $t$
BEGIN
  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.booking_id IS NOT NULL THEN
    PERFORM public.arrival_automation_run('document_verified', NEW.booking_id,
      jsonb_build_object('document_id', NEW.id, 'kind', NEW.kind));
  END IF;
  RETURN NEW;
END;
$t$;
DROP TRIGGER IF EXISTS arrival_document_verified ON public.guest_documents;
CREATE TRIGGER arrival_document_verified
AFTER UPDATE OF status ON public.guest_documents
FOR EACH ROW EXECUTE FUNCTION public.trg_arrival_document_verified();