
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

ALTER TABLE public.guest_checkins
  ADD COLUMN IF NOT EXISTS room_state_id uuid REFERENCES public.room_states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- ---------------------------------------------------------------- eligibility
CREATE OR REPLACE FUNCTION public.checkin_eligibility(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _b public.bookings%ROWTYPE;
  _r public.rooms%ROWTYPE;
  _fp text;
  _snap jsonb;
  _open_from date;
BEGIN
  SELECT * INTO _b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'We could not find this reservation.');
  END IF;

  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;

  _fp := md5(coalesce(_b.status::text,'') || '|' || coalesce(_b.room_id::text,'') || '|' ||
             coalesce(_b.check_in::text,'') || '|' || coalesce(_b.check_out::text,''));
  _snap := jsonb_build_object(
    'fingerprint', _fp, 'status', _b.status, 'room_id', _b.room_id,
    'room_name', COALESCE(_r.name, 'Room'), 'check_in', _b.check_in, 'check_out', _b.check_out);

  IF _b.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code','cancelled','message','This reservation has been cancelled. Please contact the lodge.','snapshot',_snap);
  END IF;
  IF _b.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'code','already_checked_in','message','This reservation is already checked in.','snapshot',_snap);
  END IF;
  IF _b.status IN ('completed','no_show') THEN
    RETURN jsonb_build_object('ok', false, 'code','ineligible','message','This reservation is no longer eligible for online check-in.','snapshot',_snap);
  END IF;
  IF _b.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'code','not_confirmed','message','Your reservation is not confirmed yet. Online check-in opens once it is confirmed.','snapshot',_snap);
  END IF;
  IF _r.id IS NULL OR _r.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code','room_invalid','message','Your room assignment is being updated. Please contact the lodge.','snapshot',_snap);
  END IF;

  _open_from := _b.check_in - 3;
  IF current_date < _open_from THEN
    RETURN jsonb_build_object('ok', false, 'code','too_early',
      'message','Online check-in opens 3 days before arrival (' || to_char(_open_from,'DD Mon YYYY') || ').',
      'snapshot',_snap, 'opens_on', _open_from);
  END IF;
  IF current_date > _b.check_out THEN
    RETURN jsonb_build_object('ok', false, 'code','window_closed','message','The online check-in window for this stay has closed.','snapshot',_snap);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code','eligible','message','Eligible for online check-in','snapshot',_snap);
END $$;

GRANT EXECUTE ON FUNCTION public.checkin_eligibility(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- summary
DROP FUNCTION IF EXISTS public.checkin_fetch_summary(text);
CREATE OR REPLACE FUNCTION public.checkin_fetch_summary(_token text)
RETURNS TABLE(reference text, check_in date, check_out date, nights integer, room_name text,
              status checkin_status, expires_at timestamptz, email_hint text, surname_hint text,
              locked boolean, has_draft boolean, draft_step smallint, submitted_at timestamptz,
              eligible boolean, eligibility_code text, eligibility_message text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE; _r public.rooms%ROWTYPE; _e jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RETURN; END IF;
  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  _e := public.checkin_eligibility(_b.id);

  RETURN QUERY SELECT
    _b.reference, _b.check_in, _b.check_out, _b.nights,
    COALESCE(_r.name, 'Room'),
    CASE WHEN _c.status IN ('not_started','in_progress') AND _c.expires_at <= now()
         THEN 'expired'::public.checkin_status ELSE _c.status END,
    _c.expires_at,
    regexp_replace(_b.guest_email, '^(.).*(@.*)$', '\1•••••\2'),
    upper(left(split_part(trim(_b.guest_name), ' ', array_length(string_to_array(trim(_b.guest_name), ' '), 1)), 1)) || '•••',
    (_c.locked_at IS NOT NULL),
    (_c.draft IS NOT NULL AND _c.draft <> '{}'::jsonb),
    _c.draft_step,
    _c.submitted_at,
    (_e->>'ok')::boolean, _e->>'code', _e->>'message';
END $$;

-- ---------------------------------------------------------------- verify
CREATE OR REPLACE FUNCTION public.checkin_verify(_token text, _answer text, _session_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE; _r public.rooms%ROWTYPE;
  _a public.arrival_information%ROWTYPE; _norm text; _surname text; _e jsonb;
  _timeout interval := interval '30 minutes'; _resumed boolean := false;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Invalid check-in link'); END IF;
  IF _answer IS NULL OR length(trim(_answer)) < 2 THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Verification value required'); END IF;

  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Invalid check-in link'); END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Reservation not found'); END IF;

  IF _c.locked_at IS NOT NULL OR _c.status IN ('submitted','under_review','approved') THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_blocked_locked', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'locked', 'message', 'This check-in has already been submitted');
  END IF;

  IF _c.expires_at <= now() AND _c.status IN ('not_started','in_progress') THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_blocked_expired', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'expired', 'message', 'This check-in link has expired');
  END IF;

  _norm := lower(trim(_answer));
  _surname := lower(split_part(trim(_b.guest_name), ' ',
    array_length(string_to_array(trim(_b.guest_name), ' '), 1)));
  IF _norm <> lower(trim(_b.guest_email)) AND _norm <> _surname THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_failed', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'verify_failed', 'message', 'We could not match those details to this reservation');
  END IF;

  _e := public.checkin_eligibility(_b.id);
  IF NOT (_e->>'ok')::boolean THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_blocked_ineligible', _session_id, _e);
    RETURN jsonb_build_object('ok', false, 'code', _e->>'code', 'message', _e->>'message');
  END IF;

  IF _session_id IS NOT NULL AND _c.session_id IS NOT NULL AND _c.session_id <> _session_id
     AND COALESCE(_c.last_activity_at, _c.session_started_at, _c.updated_at) > now() - _timeout THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'session_conflict', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'conflict',
      'message', 'This check-in is already open in another browser or device. Close it and try again in a few minutes.');
  END IF;

  _resumed := (_c.draft IS NOT NULL AND _c.draft <> '{}'::jsonb);

  UPDATE public.guest_checkins
     SET status = CASE WHEN status = 'not_started' THEN 'in_progress'::public.checkin_status ELSE status END,
         started_at = COALESCE(started_at, now()),
         session_id = COALESCE(_session_id, session_id),
         session_started_at = now(),
         last_activity_at = now(),
         reservation_snapshot = _e->'snapshot',
         updated_at = now()
   WHERE id = _c.id
   RETURNING * INTO _c;

  PERFORM public.checkin_log_activity(_c.id, _b.id,
    CASE WHEN _resumed THEN 'resume' ELSE 'verify' END, _session_id,
    jsonb_build_object('draft_step', _c.draft_step, 'snapshot', _e->'snapshot'));

  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  SELECT * INTO _a FROM public.arrival_information WHERE checkin_id = _c.id;

  RETURN jsonb_build_object(
    'ok', true,
    'checkin', jsonb_build_object(
      'id', _c.id, 'status', _c.status, 'expires_at', _c.expires_at,
      'submitted_at', _c.submitted_at, 'signature_name', _c.signature_name,
      'metadata', _c.metadata, 'draft', _c.draft, 'draft_step', _c.draft_step,
      'resumed', _resumed, 'session_id', _c.session_id,
      'last_activity_at', _c.last_activity_at,
      'session_timeout_seconds', 1800),
    'booking', jsonb_build_object(
      'reference', _b.reference, 'check_in', _b.check_in, 'check_out', _b.check_out,
      'nights', _b.nights, 'adults', _b.adults, 'children', _b.children,
      'guest_name', _b.guest_name, 'guest_email', _b.guest_email,
      'guest_phone', _b.guest_phone, 'country', _b.country,
      'room_name', COALESCE(_r.name, 'Room')),
    'eligibility', _e,
    'arrival', CASE WHEN _a.id IS NULL THEN NULL ELSE to_jsonb(_a) END
  );
END $$;

-- ---------------------------------------------------------------- sync
CREATE OR REPLACE FUNCTION public.checkin_sync_reservation(_checkin_id uuid, _client jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE;
  _state public.room_states%ROWTYPE; _units int; _blocked int;
BEGIN
  SELECT * INTO _c FROM public.guest_checkins WHERE id = _checkin_id;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id FOR UPDATE;

  -- room unit allocation: reuse the linked unit, else claim a free one
  SELECT * INTO _state FROM public.room_states
   WHERE booking_id = _b.id AND room_id = _b.room_id LIMIT 1;

  IF _state.id IS NULL THEN
    SELECT count(*) INTO _units FROM public.room_states WHERE room_id = _b.room_id;
    IF _units > 0 THEN
      SELECT * INTO _state FROM public.room_states rs
       WHERE rs.room_id = _b.room_id
         AND rs.state IN ('vacant_clean','reserved','inspection')
         AND (rs.booking_id IS NULL OR rs.booking_id = _b.id)
       ORDER BY rs.unit_label
       FOR UPDATE SKIP LOCKED
       LIMIT 1;

      IF _state.id IS NULL THEN
        SELECT count(*) INTO _blocked FROM public.room_states
         WHERE room_id = _b.room_id AND state IN ('maintenance','out_of_service');
        RETURN jsonb_build_object('ok', false, 'code','room_conflict',
          'message','Your room is not ready for check-in yet. Our front desk will complete your arrival on site.');
      END IF;
    END IF;
  END IF;

  IF _state.id IS NOT NULL THEN
    UPDATE public.room_states
       SET state = 'occupied', booking_id = _b.id, updated_at = now()
     WHERE id = _state.id;
  END IF;

  UPDATE public.bookings
     SET status = 'checked_in', checked_in_at = now(), updated_at = now()
   WHERE id = _b.id;

  UPDATE public.guest_checkins
     SET room_state_id = _state.id, checked_in_at = now(), updated_at = now()
   WHERE id = _c.id;

  PERFORM public.log_calendar_event('reservation.checked_in', _b.room_id, _b.id, NULL,
    _b.check_in, _b.check_out,
    jsonb_build_object('reference', _b.reference, 'source', 'online_checkin',
                       'unit_label', _state.unit_label, 'checkin_id', _c.id));

  INSERT INTO public.activity_logs (action, module, entity_type, entity_id, entity_label,
                                    severity, metadata, ip_address, user_agent, new_value)
  VALUES ('reservation.checked_in', 'operations', 'booking', _b.id, _b.reference, 'audit',
          jsonb_build_object('source','online_checkin','checkin_id',_c.id,'guest_id',_b.guest_id,
                             'room_id',_b.room_id,'unit_label',_state.unit_label,
                             'device', _client->>'device', 'timezone', _client->>'timezone'),
          NULLIF(_client->>'ip',''), NULLIF(_client->>'user_agent',''),
          jsonb_build_object('status','checked_in','room_state', _state.state));

  RETURN jsonb_build_object('ok', true, 'unit_label', _state.unit_label);
END $$;

-- ---------------------------------------------------------------- submit
CREATE OR REPLACE FUNCTION public.checkin_submit(_token text, _answer text, _guest jsonb, _arrival jsonb,
  _final boolean DEFAULT true, _session_id text DEFAULT NULL, _client jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE;
  _norm text; _surname text; _name text; _email text;
  _timeout interval := interval '30 minutes'; _e jsonb; _sync jsonb; _prev_fp text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid check-in link'); END IF;
  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid check-in link'); END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;

  IF _c.locked_at IS NOT NULL OR _c.status IN ('submitted','under_review','approved') THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_locked', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','locked','message','This check-in has already been submitted');
  END IF;
  IF _c.expires_at <= now() AND _c.status IN ('not_started','in_progress') THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_expired', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','expired','message','This check-in link has expired');
  END IF;
  IF _session_id IS NOT NULL AND _c.session_id IS NOT NULL AND _c.session_id <> _session_id THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_session', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','session','message','Your check-in session is no longer active. Please verify again.');
  END IF;
  IF _session_id IS NOT NULL AND COALESCE(_c.last_activity_at, _c.session_started_at) <= now() - _timeout THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'session_timeout', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','session','message','Your check-in session timed out. Please verify again.');
  END IF;

  _norm := lower(trim(COALESCE(_answer,'')));
  _surname := lower(split_part(trim(_b.guest_name), ' ',
    array_length(string_to_array(trim(_b.guest_name), ' '), 1)));
  IF _norm <> lower(trim(_b.guest_email)) AND _norm <> _surname THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_verify_failed', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','verify_failed','message','Verification failed');
  END IF;

  -- live reservation revalidation + conflict detection
  _e := public.checkin_eligibility(_b.id);
  IF NOT (_e->>'ok')::boolean THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_ineligible', _session_id, _e);
    RETURN jsonb_build_object('ok', false, 'code', _e->>'code', 'message', _e->>'message');
  END IF;

  IF _final THEN
    _prev_fp := _c.reservation_snapshot->>'fingerprint';
    IF _prev_fp IS NOT NULL AND _prev_fp <> (_e->'snapshot'->>'fingerprint') THEN
      UPDATE public.guest_checkins SET reservation_snapshot = _e->'snapshot', updated_at = now() WHERE id = _c.id;
      PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_reservation_changed', _session_id,
        jsonb_build_object('before', _c.reservation_snapshot, 'after', _e->'snapshot'));
      RETURN jsonb_build_object('ok', false, 'code','reservation_changed',
        'message','Your reservation was updated by our team while you were checking in. Please review the refreshed details and submit again.',
        'snapshot', _e->'snapshot');
    END IF;
  END IF;

  _name := NULLIF(trim(COALESCE(_guest->>'full_name','')), '');
  _email := NULLIF(lower(trim(COALESCE(_guest->>'email',''))), '');
  IF _final THEN
    IF _name IS NULL OR length(_name) < 2 THEN RETURN jsonb_build_object('ok', false, 'code','validation','message','Full name is required'); END IF;
    IF _email IS NULL OR _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN jsonb_build_object('ok', false, 'code','validation','message','A valid email is required'); END IF;
  END IF;

  INSERT INTO public.arrival_information (
    checkin_id, booking_id, estimated_arrival_time, arrival_date, arrival_mode,
    flight_number, airport, transfer_required, transfer_notes, visit_purpose,
    dietary_requirements, accessibility_needs, special_requests,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation
  ) VALUES (
    _c.id, _b.id,
    NULLIF(_arrival->>'estimated_arrival_time','')::time,
    COALESCE(NULLIF(_arrival->>'arrival_date','')::date, _b.check_in),
    NULLIF(_arrival->>'arrival_mode',''),
    NULLIF(_arrival->>'flight_number',''),
    NULLIF(_arrival->>'airport',''),
    COALESCE((_arrival->>'transfer_required')::boolean, false),
    NULLIF(_arrival->>'transfer_notes',''),
    NULLIF(_arrival->>'visit_purpose',''),
    NULLIF(_arrival->>'dietary_requirements',''),
    NULLIF(_arrival->>'accessibility_needs',''),
    NULLIF(_arrival->>'special_requests',''),
    NULLIF(_arrival->>'emergency_contact_name',''),
    NULLIF(_arrival->>'emergency_contact_phone',''),
    NULLIF(_arrival->>'emergency_contact_relation','')
  )
  ON CONFLICT (checkin_id) DO UPDATE SET
    estimated_arrival_time = EXCLUDED.estimated_arrival_time,
    arrival_date = EXCLUDED.arrival_date,
    arrival_mode = EXCLUDED.arrival_mode,
    flight_number = EXCLUDED.flight_number,
    airport = EXCLUDED.airport,
    transfer_required = EXCLUDED.transfer_required,
    transfer_notes = EXCLUDED.transfer_notes,
    visit_purpose = EXCLUDED.visit_purpose,
    dietary_requirements = EXCLUDED.dietary_requirements,
    accessibility_needs = EXCLUDED.accessibility_needs,
    special_requests = EXCLUDED.special_requests,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    emergency_contact_relation = EXCLUDED.emergency_contact_relation,
    updated_at = now();

  UPDATE public.guest_checkins
     SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('guest', _guest),
         draft = CASE WHEN _final THEN '{}'::jsonb
                      ELSE jsonb_build_object('guest', COALESCE(_guest,'{}'::jsonb), 'arrival', COALESCE(_arrival,'{}'::jsonb)) END,
         draft_step = CASE WHEN _final THEN 0::smallint ELSE draft_step END,
         signature_name = CASE WHEN _final THEN COALESCE(NULLIF(_guest->>'signature_name',''), _name) ELSE signature_name END,
         terms_accepted_at = CASE WHEN _final THEN now() ELSE terms_accepted_at END,
         submitted_at = CASE WHEN _final THEN now() ELSE submitted_at END,
         locked_at = CASE WHEN _final THEN now() ELSE locked_at END,
         session_id = CASE WHEN _final THEN NULL ELSE session_id END,
         reservation_snapshot = _e->'snapshot',
         last_activity_at = now(),
         status = CASE WHEN _final THEN 'submitted'::public.checkin_status ELSE 'in_progress'::public.checkin_status END,
         updated_at = now()
   WHERE id = _c.id;

  IF _final THEN
    _sync := public.checkin_sync_reservation(_c.id, COALESCE(_client, '{}'::jsonb));

    INSERT INTO public.ops_tasks (booking_id, task_type, title, description, priority, due_at)
    VALUES (_b.id, 'checkin_review', 'Review online check-in — ' || _b.reference,
            'Guest submitted online check-in details', 2,
            (_b.check_in - interval '1 day')::timestamptz);

    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit', _session_id,
      jsonb_build_object('sync', _sync, 'device', _client->>'device', 'ip', _client->>'ip'));

    RETURN jsonb_build_object('ok', true, 'status', 'submitted', 'sync', _sync,
      'room_ready', COALESCE((_sync->>'ok')::boolean, false),
      'message', CASE WHEN COALESCE((_sync->>'ok')::boolean, false)
                      THEN 'Checked in' ELSE _sync->>'message' END);
  END IF;

  PERFORM public.checkin_log_activity(_c.id, _b.id, 'draft_saved', _session_id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END $$;

DROP FUNCTION IF EXISTS public.checkin_submit(text, text, jsonb, jsonb, boolean, text);
