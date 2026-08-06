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

  INSERT INTO public.activity_logs (actor_id, action, module, entity_type, entity_id, entity_label,
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

  INSERT INTO public.activity_logs (actor_id, action, module, entity_type, entity_id, entity_label,
                                    severity, metadata, ip_address, user_agent, new_value)
  VALUES (auth.uid(), 'arrival_pass.confirmed', 'operations', 'booking', _b.id, _b.reference,
          'audit', jsonb_build_object('pass_id', _p.id, 'guest_id', _b.guest_id,
                                      'device', _client->>'device', 'sync', _sync),
          NULLIF(_client->>'ip',''), NULLIF(_client->>'user_agent',''),
          jsonb_build_object('arrival','confirmed'));

  RETURN jsonb_build_object('ok', true, 'code','confirmed',
    'message','Arrival confirmed', 'reservation', _v->'reservation', 'sync', _sync);
END $function$;