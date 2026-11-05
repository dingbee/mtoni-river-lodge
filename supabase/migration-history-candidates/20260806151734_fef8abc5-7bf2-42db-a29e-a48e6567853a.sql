-- Arrival pass status enum
DO $$ BEGIN
  CREATE TYPE public.arrival_pass_status AS ENUM ('active','used','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.arrival_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.guest_checkins(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  status public.arrival_pass_status NOT NULL DEFAULT 'active',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scan_count integer NOT NULL DEFAULT 0,
  last_scanned_at timestamptz,
  reservation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arrival_passes_one_active_per_booking
  ON public.arrival_passes (booking_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS arrival_passes_checkin_idx ON public.arrival_passes (checkin_id);
CREATE INDEX IF NOT EXISTS arrival_passes_booking_idx ON public.arrival_passes (booking_id);

GRANT SELECT ON public.arrival_passes TO authenticated;
GRANT ALL ON public.arrival_passes TO service_role;

ALTER TABLE public.arrival_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view arrival passes" ON public.arrival_passes;
CREATE POLICY "Staff can view arrival passes"
  ON public.arrival_passes FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

DROP TRIGGER IF EXISTS set_arrival_passes_updated_at ON public.arrival_passes;
CREATE TRIGGER set_arrival_passes_updated_at
  BEFORE UPDATE ON public.arrival_passes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Issue (or resume) an arrival pass for a completed online check-in.
-- Guest-facing: keyed by the existing check-in token, never by booking id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arrival_pass_ensure(_checkin_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c public.guest_checkins%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _p public.arrival_passes%ROWTYPE;
  _e jsonb;
  _tok text;
BEGIN
  IF _checkin_token IS NULL OR length(_checkin_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid check-in link');
  END IF;

  SELECT * INTO _c FROM public.guest_checkins WHERE token = _checkin_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid check-in link');
  END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id;

  IF _c.status NOT IN ('submitted','under_review','approved') THEN
    RETURN jsonb_build_object('ok', false, 'code','not_submitted',
      'message','Your arrival pass becomes available once online check-in is complete.');
  END IF;
  IF _b.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code','cancelled',
      'message','This reservation has been cancelled. Please contact the lodge.');
  END IF;

  SELECT * INTO _p FROM public.arrival_passes
   WHERE booking_id = _b.id AND status = 'active' LIMIT 1;

  IF _p.id IS NOT NULL AND _p.expires_at > now() THEN
    RETURN jsonb_build_object('ok', true, 'token', _p.token, 'reissued', false);
  END IF;

  IF _p.id IS NOT NULL THEN
    UPDATE public.arrival_passes SET status='expired', updated_at=now() WHERE id=_p.id;
  END IF;

  _e := public.checkin_eligibility(_b.id);
  _tok := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.arrival_passes (checkin_id, booking_id, guest_id, token, expires_at, reservation_snapshot, metadata)
  VALUES (_c.id, _b.id, _b.guest_id, _tok,
          (_b.check_out + interval '1 day')::timestamptz,
          COALESCE(_e->'snapshot', '{}'::jsonb),
          jsonb_build_object('issued_via','online_checkin'))
  RETURNING * INTO _p;

  PERFORM public.checkin_log_activity(_c.id, _b.id, 'arrival_pass_issued', NULL,
    jsonb_build_object('pass_id', _p.id));

  RETURN jsonb_build_object('ok', true, 'token', _p.token, 'reissued', true);
END $function$;

-- ---------------------------------------------------------------------------
-- Guest-facing pass view. Only non-sensitive stay details.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arrival_pass_fetch(_pass_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p public.arrival_passes%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _r public.rooms%ROWTYPE;
  _unit text;
  _status text;
BEGIN
  IF _pass_token IS NULL OR length(_pass_token) < 24 THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid arrival pass link');
  END IF;
  SELECT * INTO _p FROM public.arrival_passes WHERE token = _pass_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid arrival pass link');
  END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _p.booking_id;
  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  SELECT unit_label INTO _unit FROM public.room_states WHERE booking_id = _b.id LIMIT 1;

  _status := CASE
    WHEN _p.status = 'active' AND _p.expires_at <= now() THEN 'expired'
    ELSE _p.status::text END;

  RETURN jsonb_build_object(
    'ok', true,
    'pass', jsonb_build_object(
      'status', _status,
      'issued_at', _p.issued_at,
      'expires_at', _p.expires_at,
      'used_at', _p.used_at,
      'token', _p.token),
    'stay', jsonb_build_object(
      'guest_name', _b.guest_name,
      'reference', _b.reference,
      'check_in', _b.check_in,
      'check_out', _b.check_out,
      'nights', _b.nights,
      'adults', _b.adults,
      'children', _b.children,
      'room_name', COALESCE(_r.name, 'Room'),
      'unit_label', _unit,
      'reservation_status', _b.status)
  );
END $function$;

-- ---------------------------------------------------------------------------
-- Staff scan: validate a pass against live reservation state. Read-only apart
-- from scan telemetry + audit rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arrival_pass_validate(_pass_token text, _client jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p public.arrival_passes%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _r public.rooms%ROWTYPE;
  _c public.guest_checkins%ROWTYPE;
  _a public.arrival_information%ROWTYPE;
  _unit text;
  _e jsonb;
  _fp_before text;
  _code text := 'valid';
  _msg text := 'Arrival pass verified';
  _ok boolean := true;
  _docs jsonb;
BEGIN
  IF NOT public.is_any_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _pass_token IS NULL OR length(_pass_token) < 24 THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','This code is not a Mtoni arrival pass.');
  END IF;

  SELECT * INTO _p FROM public.arrival_passes WHERE token = _pass_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','No arrival pass matches this code.');
  END IF;

  SELECT * INTO _b FROM public.bookings WHERE id = _p.booking_id;
  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;
  SELECT * INTO _c FROM public.guest_checkins WHERE id = _p.checkin_id;
  SELECT * INTO _a FROM public.arrival_information WHERE checkin_id = _p.checkin_id;
  SELECT unit_label INTO _unit FROM public.room_states WHERE booking_id = _b.id LIMIT 1;

  SELECT jsonb_build_object(
           'total', count(*),
           'verified', count(*) FILTER (WHERE status = 'verified'),
           'rejected', count(*) FILTER (WHERE status = 'rejected'))
    INTO _docs FROM public.guest_documents WHERE booking_id = _b.id;

  _e := public.checkin_eligibility(_b.id);
  _fp_before := _p.reservation_snapshot->>'fingerprint';

  IF _p.status = 'revoked' THEN
    _ok := false; _code := 'revoked'; _msg := 'This arrival pass was revoked. Continue at the front desk.';
  ELSIF _p.status = 'used' THEN
    _ok := false; _code := 'used'; _msg := 'This arrival pass has already been used for arrival.';
  ELSIF _p.status = 'expired' OR _p.expires_at <= now() THEN
    _ok := false; _code := 'expired'; _msg := 'This arrival pass has expired.';
  ELSIF _b.status = 'cancelled' THEN
    _ok := false; _code := 'cancelled'; _msg := 'This reservation has been cancelled.';
  ELSIF _b.status IN ('completed','no_show') THEN
    _ok := false; _code := 'ineligible'; _msg := 'This reservation is closed.';
  ELSIF _fp_before IS NOT NULL AND _e->'snapshot'->>'fingerprint' IS DISTINCT FROM _fp_before THEN
    _ok := false; _code := 'reservation_changed';
    _msg := 'The reservation changed after this pass was issued. Review before confirming arrival.';
  END IF;

  UPDATE public.arrival_passes
     SET scan_count = scan_count + 1, last_scanned_at = now(),
         status = CASE WHEN status = 'active' AND expires_at <= now() THEN 'expired'::public.arrival_pass_status ELSE status END,
         updated_at = now()
   WHERE id = _p.id;

  PERFORM public.checkin_log_activity(_p.checkin_id, _b.id, 'arrival_pass_scanned', NULL,
    jsonb_build_object('pass_id', _p.id, 'result', _code, 'device', _client->>'device'));

  INSERT INTO public.activity_logs (user_id, action, module, entity_type, entity_id, entity_label,
                                    severity, metadata, ip_address, user_agent)
  VALUES (auth.uid(), 'arrival_pass.scanned', 'operations', 'booking', _b.id, _b.reference,
          'audit', jsonb_build_object('pass_id', _p.id, 'result', _code,
                                      'guest_id', _b.guest_id, 'device', _client->>'device',
                                      'timezone', _client->>'timezone'),
          NULLIF(_client->>'ip',''), NULLIF(_client->>'user_agent',''));

  RETURN jsonb_build_object(
    'ok', _ok, 'code', _code, 'message', _msg,
    'pass', jsonb_build_object('id', _p.id, 'token', _p.token, 'status', _p.status,
                               'issued_at', _p.issued_at, 'expires_at', _p.expires_at,
                               'used_at', _p.used_at, 'scan_count', _p.scan_count + 1),
    'reservation', jsonb_build_object('id', _b.id, 'reference', _b.reference, 'status', _b.status,
                                      'guest_name', _b.guest_name, 'guest_email', _b.guest_email,
                                      'check_in', _b.check_in, 'check_out', _b.check_out,
                                      'nights', _b.nights, 'adults', _b.adults, 'children', _b.children,
                                      'room_name', COALESCE(_r.name,'Room'), 'unit_label', _unit,
                                      'payment_status', _b.payment_status,
                                      'balance_amount', _b.balance_amount, 'currency', _b.currency,
                                      'checked_in_at', _b.checked_in_at,
                                      'special_requests', COALESCE(_a.special_requests, _b.special_requests),
                                      'estimated_arrival_time', _a.estimated_arrival_time),
    'checkin', jsonb_build_object('id', _c.id, 'status', _c.status, 'submitted_at', _c.submitted_at),
    'documents', COALESCE(_docs, '{}'::jsonb),
    'eligibility', _e);
END $function$;

-- ---------------------------------------------------------------------------
-- Staff confirm arrival from a scanned pass. Reuses checkin_sync_reservation
-- for allocation / calendar / occupancy; never re-implements it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arrival_pass_confirm(_pass_token text, _client jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p public.arrival_passes%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _sync jsonb := NULL;
  _v jsonb;
BEGIN
  IF NOT public.is_any_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  _v := public.arrival_pass_validate(_pass_token, _client);
  IF NOT COALESCE((_v->>'ok')::boolean, false) THEN
    RETURN _v;
  END IF;

  SELECT * INTO _p FROM public.arrival_passes WHERE token = _pass_token FOR UPDATE;
  SELECT * INTO _b FROM public.bookings WHERE id = _p.booking_id;

  IF _b.status <> 'checked_in' THEN
    _sync := public.checkin_sync_reservation(_p.checkin_id, COALESCE(_client, '{}'::jsonb));
    IF NOT COALESCE((_sync->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', COALESCE(_sync->>'code','room_conflict'),
                                'message', _sync->>'message');
    END IF;
  END IF;

  UPDATE public.arrival_passes
     SET status = 'used', used_at = now(), used_by = auth.uid(), updated_at = now()
   WHERE id = _p.id;

  UPDATE public.guest_checkins
     SET status = CASE WHEN status IN ('submitted','under_review') THEN 'approved'::public.checkin_status ELSE status END,
         updated_at = now()
   WHERE id = _p.checkin_id;

  PERFORM public.checkin_log_activity(_p.checkin_id, _b.id, 'arrival_pass_confirmed', NULL,
    jsonb_build_object('pass_id', _p.id, 'sync', _sync));

  INSERT INTO public.activity_logs (user_id, action, module, entity_type, entity_id, entity_label,
                                    severity, metadata, ip_address, user_agent, new_value)
  VALUES (auth.uid(), 'arrival_pass.confirmed', 'operations', 'booking', _b.id, _b.reference,
          'audit', jsonb_build_object('pass_id', _p.id, 'guest_id', _b.guest_id,
                                      'device', _client->>'device', 'sync', _sync),
          NULLIF(_client->>'ip',''), NULLIF(_client->>'user_agent',''),
          jsonb_build_object('arrival','confirmed'));

  RETURN jsonb_build_object('ok', true, 'code','confirmed',
    'message','Arrival confirmed', 'reservation', _v->'reservation', 'sync', _sync);
END $function$;

REVOKE ALL ON FUNCTION public.arrival_pass_validate(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.arrival_pass_confirm(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.arrival_pass_validate(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arrival_pass_confirm(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arrival_pass_ensure(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arrival_pass_fetch(text) TO anon, authenticated, service_role;