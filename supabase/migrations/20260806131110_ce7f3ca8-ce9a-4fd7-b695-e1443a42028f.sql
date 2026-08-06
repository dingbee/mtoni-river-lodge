-- 1. Session / draft columns
ALTER TABLE public.guest_checkins
  ADD COLUMN IF NOT EXISTS draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- 2. Activity audit log
CREATE TABLE IF NOT EXISTS public.guest_checkin_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.guest_checkins(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  action text NOT NULL,
  session_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_checkin_activity TO authenticated;
GRANT ALL ON public.guest_checkin_activity TO service_role;

ALTER TABLE public.guest_checkin_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read checkin activity" ON public.guest_checkin_activity;
CREATE POLICY "Staff read checkin activity"
  ON public.guest_checkin_activity FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_checkin_activity_checkin ON public.guest_checkin_activity(checkin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_activity_booking ON public.guest_checkin_activity(booking_id);

-- 3. Internal logger
CREATE OR REPLACE FUNCTION public.checkin_log_activity(
  _checkin_id uuid, _booking_id uuid, _action text, _session_id text, _detail jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.guest_checkin_activity (checkin_id, booking_id, action, session_id, detail)
  VALUES (_checkin_id, _booking_id, _action, _session_id, COALESCE(_detail, '{}'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.checkin_log_activity(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 4. Summary now exposes session/lock state
DROP FUNCTION IF EXISTS public.checkin_fetch_summary(text);
CREATE FUNCTION public.checkin_fetch_summary(_token text)
RETURNS TABLE(reference text, check_in date, check_out date, nights integer, room_name text,
              status checkin_status, expires_at timestamptz, email_hint text, surname_hint text,
              locked boolean, has_draft boolean, draft_step smallint, submitted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
    upper(left(split_part(trim(_b.guest_name), ' ', array_length(string_to_array(trim(_b.guest_name), ' '), 1)), 1)) || '•••',
    (_c.locked_at IS NOT NULL),
    (_c.draft IS NOT NULL AND _c.draft <> '{}'::jsonb),
    _c.draft_step,
    _c.submitted_at;
END $$;

-- 5. Verify claims a guest session and returns any saved draft
DROP FUNCTION IF EXISTS public.checkin_verify(text, text);
CREATE FUNCTION public.checkin_verify(_token text, _answer text, _session_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE; _r public.rooms%ROWTYPE;
  _a public.arrival_information%ROWTYPE; _norm text; _surname text;
  _timeout interval := interval '30 minutes'; _resumed boolean := false;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  IF _answer IS NULL OR length(trim(_answer)) < 2 THEN RAISE EXCEPTION 'Verification value required'; END IF;

  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;

  IF _c.locked_at IS NOT NULL OR _c.status IN ('submitted','under_review','approved') THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_blocked_locked', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'This check-in has already been submitted';
  END IF;

  IF _c.expires_at <= now() AND _c.status IN ('not_started','in_progress') THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_blocked_expired', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'This check-in link has expired';
  END IF;

  _norm := lower(trim(_answer));
  _surname := lower(split_part(trim(_b.guest_name), ' ',
    array_length(string_to_array(trim(_b.guest_name), ' '), 1)));
  IF _norm <> lower(trim(_b.guest_email)) AND _norm <> _surname THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'verify_failed', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'We could not match those details to this reservation';
  END IF;

  -- Concurrency: another live session holds this check-in
  IF _session_id IS NOT NULL AND _c.session_id IS NOT NULL AND _c.session_id <> _session_id
     AND COALESCE(_c.last_activity_at, _c.session_started_at, _c.updated_at) > now() - _timeout THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'session_conflict', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'This check-in is already open in another browser or device. Close it and try again in a few minutes.';
  END IF;

  _resumed := (_c.draft IS NOT NULL AND _c.draft <> '{}'::jsonb);

  UPDATE public.guest_checkins
     SET status = CASE WHEN status = 'not_started' THEN 'in_progress'::public.checkin_status ELSE status END,
         started_at = COALESCE(started_at, now()),
         session_id = COALESCE(_session_id, session_id),
         session_started_at = now(),
         last_activity_at = now(),
         updated_at = now()
   WHERE id = _c.id
   RETURNING * INTO _c;

  PERFORM public.checkin_log_activity(_c.id, _b.id,
    CASE WHEN _resumed THEN 'resume' ELSE 'verify' END, _session_id,
    jsonb_build_object('draft_step', _c.draft_step));

  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  SELECT * INTO _a FROM public.arrival_information WHERE checkin_id = _c.id;

  RETURN jsonb_build_object(
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
    'arrival', CASE WHEN _a.id IS NULL THEN NULL ELSE to_jsonb(_a) END
  );
END $$;

-- 6. Autosave draft (session-scoped, no answer replay needed)
CREATE OR REPLACE FUNCTION public.checkin_save_draft(
  _token text, _session_id text, _guest jsonb, _arrival jsonb, _step integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c public.guest_checkins%ROWTYPE; _timeout interval := interval '30 minutes';
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  IF _session_id IS NULL OR length(trim(_session_id)) < 8 THEN RAISE EXCEPTION 'Session required'; END IF;

  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;

  IF _c.locked_at IS NOT NULL OR _c.status IN ('submitted','under_review','approved') THEN
    RAISE EXCEPTION 'This check-in has already been submitted';
  END IF;
  IF _c.expires_at <= now() THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    RAISE EXCEPTION 'This check-in link has expired';
  END IF;
  IF _c.session_id IS DISTINCT FROM _session_id THEN
    PERFORM public.checkin_log_activity(_c.id, _c.booking_id, 'draft_rejected_session', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'Your check-in session is no longer active. Please verify again.';
  END IF;
  IF COALESCE(_c.last_activity_at, _c.session_started_at) <= now() - _timeout THEN
    PERFORM public.checkin_log_activity(_c.id, _c.booking_id, 'session_timeout', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'Your check-in session timed out. Please verify again.';
  END IF;

  UPDATE public.guest_checkins
     SET draft = jsonb_build_object('guest', COALESCE(_guest,'{}'::jsonb), 'arrival', COALESCE(_arrival,'{}'::jsonb)),
         draft_step = GREATEST(COALESCE(_step,0), 0)::smallint,
         status = CASE WHEN status = 'not_started' THEN 'in_progress'::public.checkin_status ELSE status END,
         last_activity_at = now(),
         updated_at = now()
   WHERE id = _c.id;

  PERFORM public.checkin_log_activity(_c.id, _c.booking_id, 'draft_saved', _session_id,
    jsonb_build_object('step', _step));

  RETURN jsonb_build_object('ok', true, 'saved_at', now(), 'step', _step);
END $$;

-- 7. Submit: session-bound, locking, single-use
DROP FUNCTION IF EXISTS public.checkin_submit(text, text, jsonb, jsonb, boolean);
CREATE FUNCTION public.checkin_submit(
  _token text, _answer text, _guest jsonb, _arrival jsonb,
  _final boolean DEFAULT true, _session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _c public.guest_checkins%ROWTYPE; _b public.bookings%ROWTYPE;
  _norm text; _surname text; _name text; _email text;
  _timeout interval := interval '30 minutes';
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid check-in link'; END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;

  IF _c.locked_at IS NOT NULL OR _c.status IN ('submitted','under_review','approved') THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_locked', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'This check-in has already been submitted';
  END IF;
  IF _c.expires_at <= now() AND _c.status IN ('not_started','in_progress') THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    RAISE EXCEPTION 'This check-in link has expired';
  END IF;
  IF _session_id IS NOT NULL AND _c.session_id IS NOT NULL AND _c.session_id <> _session_id THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_session', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'Your check-in session is no longer active. Please verify again.';
  END IF;
  IF _session_id IS NOT NULL AND COALESCE(_c.last_activity_at, _c.session_started_at) <= now() - _timeout THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'session_timeout', _session_id, '{}'::jsonb);
    RAISE EXCEPTION 'Your check-in session timed out. Please verify again.';
  END IF;

  _norm := lower(trim(COALESCE(_answer,'')));
  _surname := lower(split_part(trim(_b.guest_name), ' ',
    array_length(string_to_array(trim(_b.guest_name), ' '), 1)));
  IF _norm <> lower(trim(_b.guest_email)) AND _norm <> _surname THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_verify_failed', _session_id, '{}'::jsonb);
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
         draft = CASE WHEN _final THEN '{}'::jsonb
                      ELSE jsonb_build_object('guest', COALESCE(_guest,'{}'::jsonb), 'arrival', COALESCE(_arrival,'{}'::jsonb)) END,
         draft_step = CASE WHEN _final THEN 0::smallint ELSE draft_step END,
         signature_name = CASE WHEN _final THEN COALESCE(NULLIF(_guest->>'signature_name',''), _name) ELSE signature_name END,
         terms_accepted_at = CASE WHEN _final THEN now() ELSE terms_accepted_at END,
         submitted_at = CASE WHEN _final THEN now() ELSE submitted_at END,
         locked_at = CASE WHEN _final THEN now() ELSE locked_at END,
         session_id = CASE WHEN _final THEN NULL ELSE session_id END,
         last_activity_at = now(),
         status = CASE WHEN _final THEN 'submitted'::public.checkin_status ELSE 'in_progress'::public.checkin_status END,
         updated_at = now()
   WHERE id = _c.id;

  IF _final THEN
    INSERT INTO public.ops_tasks (booking_id, task_type, title, description, priority, due_at)
    VALUES (_b.id, 'checkin_review', 'Review online check-in — ' || _b.reference,
            'Guest submitted online check-in details', 2,
            (_b.check_in - interval '1 day')::timestamptz);
  END IF;

  PERFORM public.checkin_log_activity(_c.id, _b.id,
    CASE WHEN _final THEN 'submit' ELSE 'draft_saved' END, _session_id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _final THEN 'submitted' ELSE 'in_progress' END);
END $$;

-- 8. Grants for guest-facing functions
REVOKE EXECUTE ON FUNCTION public.checkin_save_draft(text, text, jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_fetch_summary(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_verify(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_save_draft(text, text, jsonb, jsonb, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_submit(text, text, jsonb, jsonb, boolean, text) TO anon, authenticated;