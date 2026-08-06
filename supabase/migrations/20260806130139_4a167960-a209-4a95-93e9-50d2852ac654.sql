-- Masked summary for the verification screen
CREATE OR REPLACE FUNCTION public.checkin_fetch_summary(_token text)
RETURNS TABLE(
  reference text, check_in date, check_out date, nights int,
  room_name text, status public.checkin_status, expires_at timestamptz,
  email_hint text, surname_hint text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE; _r public.rooms%ROWTYPE;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RETURN; END IF;
  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;

  RETURN QUERY SELECT
    _b.reference, _b.check_in, _b.check_out, _b.nights,
    COALESCE(_r.name, 'Room'),
    CASE WHEN _c.status IN ('not_started','in_progress') AND _c.expires_at <= now()
         THEN 'expired'::public.checkin_status ELSE _c.status END,
    _c.expires_at,
    regexp_replace(_b.guest_email, '^(.).*(@.*)$', '\1•••••\2'),
    upper(left(split_part(trim(_b.guest_name), ' ', array_length(string_to_array(trim(_b.guest_name), ' '), 1)), 1)) || '•••';
END $$;

REVOKE ALL ON FUNCTION public.checkin_fetch_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_fetch_summary(text) TO anon, authenticated;

-- Verify identity and return the working record
CREATE OR REPLACE FUNCTION public.checkin_verify(_token text, _answer text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE; _r public.rooms%ROWTYPE;
  _a public.arrival_information%ROWTYPE; _norm text; _surname text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  IF _answer IS NULL OR length(trim(_answer)) < 2 THEN RAISE EXCEPTION 'Verification value required'; END IF;

  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;

  IF _c.expires_at <= now() AND _c.status IN ('not_started','in_progress') THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    RAISE EXCEPTION 'This check-in link has expired';
  END IF;

  _norm := lower(trim(_answer));
  _surname := lower(split_part(trim(_b.guest_name), ' ',
    array_length(string_to_array(trim(_b.guest_name), ' '), 1)));
  IF _norm <> lower(trim(_b.guest_email)) AND _norm <> _surname THEN
    RAISE EXCEPTION 'We could not match those details to this reservation';
  END IF;

  IF _c.status = 'not_started' THEN
    UPDATE public.guest_checkins
       SET status='in_progress', started_at=COALESCE(started_at, now()), updated_at=now()
     WHERE id=_c.id
     RETURNING * INTO _c;
  END IF;

  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  SELECT * INTO _a FROM public.arrival_information WHERE checkin_id = _c.id;

  RETURN jsonb_build_object(
    'checkin', jsonb_build_object(
      'id', _c.id, 'status', _c.status, 'expires_at', _c.expires_at,
      'submitted_at', _c.submitted_at, 'signature_name', _c.signature_name,
      'metadata', _c.metadata),
    'booking', jsonb_build_object(
      'reference', _b.reference, 'check_in', _b.check_in, 'check_out', _b.check_out,
      'nights', _b.nights, 'adults', _b.adults, 'children', _b.children,
      'guest_name', _b.guest_name, 'guest_email', _b.guest_email,
      'guest_phone', _b.guest_phone, 'country', _b.country,
      'room_name', COALESCE(_r.name, 'Room')),
    'arrival', CASE WHEN _a.id IS NULL THEN NULL ELSE to_jsonb(_a) END
  );
END $$;

REVOKE ALL ON FUNCTION public.checkin_verify(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_verify(text, text) TO anon, authenticated;

-- Submit (or save) the wizard payload
CREATE OR REPLACE FUNCTION public.checkin_submit(
  _token text, _answer text, _guest jsonb, _arrival jsonb, _final boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE;
  _norm text; _surname text; _name text; _email text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;

  IF _c.expires_at <= now() AND _c.status IN ('not_started','in_progress') THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    RAISE EXCEPTION 'This check-in link has expired';
  END IF;
  IF _c.status IN ('submitted','under_review','approved') THEN
    RAISE EXCEPTION 'This check-in has already been submitted';
  END IF;

  _norm := lower(trim(COALESCE(_answer,'')));
  _surname := lower(split_part(trim(_b.guest_name), ' ',
    array_length(string_to_array(trim(_b.guest_name), ' '), 1)));
  IF _norm <> lower(trim(_b.guest_email)) AND _norm <> _surname THEN
    RAISE EXCEPTION 'Verification failed';
  END IF;

  _name := NULLIF(trim(COALESCE(_guest->>'full_name','')), '');
  _email := NULLIF(lower(trim(COALESCE(_guest->>'email',''))), '');
  IF _final THEN
    IF _name IS NULL OR length(_name) < 2 THEN RAISE EXCEPTION 'Full name is required'; END IF;
    IF _email IS NULL OR _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'A valid email is required'; END IF;
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
         signature_name = CASE WHEN _final THEN COALESCE(NULLIF(_guest->>'signature_name',''), _name) ELSE signature_name END,
         terms_accepted_at = CASE WHEN _final THEN now() ELSE terms_accepted_at END,
         submitted_at = CASE WHEN _final THEN now() ELSE submitted_at END,
         status = CASE WHEN _final THEN 'submitted'::public.checkin_status ELSE 'in_progress'::public.checkin_status END,
         updated_at = now()
   WHERE id = _c.id;

  IF _final THEN
    INSERT INTO public.ops_tasks (booking_id, task_type, title, description, priority, due_at)
    VALUES (_b.id, 'checkin_review', 'Review online check-in — ' || _b.reference,
            'Guest submitted online check-in details', 2,
            (_b.check_in - interval '1 day')::timestamptz);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _final THEN 'submitted' ELSE 'in_progress' END);
END $$;

REVOKE ALL ON FUNCTION public.checkin_submit(text, text, jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_submit(text, text, jsonb, jsonb, boolean) TO anon, authenticated;

-- Staff helper: create or fetch a check-in link for a reservation
CREATE OR REPLACE FUNCTION public.checkin_ensure_for_booking(_booking_id uuid)
RETURNS TABLE(id uuid, token text, status public.checkin_status, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _b public.bookings%ROWTYPE;
BEGIN
  IF NOT public.is_any_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO _b FROM public.bookings WHERE bookings.id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;

  INSERT INTO public.guest_checkins (booking_id, guest_id, expires_at)
  VALUES (_b.id, _b.guest_id, (_b.check_out + interval '1 day')::timestamptz)
  ON CONFLICT (booking_id) DO UPDATE SET updated_at = now();

  RETURN QUERY
    SELECT c.id, c.token, c.status, c.expires_at
      FROM public.guest_checkins c WHERE c.booking_id = _b.id;
END $$;

REVOKE ALL ON FUNCTION public.checkin_ensure_for_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_ensure_for_booking(uuid) TO authenticated;