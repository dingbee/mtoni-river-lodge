-- Phase 4 security hardening: property-scope guest identity document objects.
-- Guest uploads and previews remain token/session-authorised server operations.
-- Authenticated staff may read only objects linked to guest_documents rows in a
-- property they can access. Direct client writes are intentionally not granted.

DROP POLICY IF EXISTS "guest docs staff read" ON storage.objects;
DROP POLICY IF EXISTS "guest docs staff write" ON storage.objects;
DROP POLICY IF EXISTS "guest docs staff update" ON storage.objects;
DROP POLICY IF EXISTS "guest docs staff delete" ON storage.objects;

DROP POLICY IF EXISTS "guest documents property staff read" ON storage.objects;
CREATE POLICY "guest documents property staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'guest-documents'
    AND public.is_any_staff(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.guest_documents d
      WHERE d.storage_path = storage.objects.name
        AND d.property_id IS NOT NULL
        AND public.staynas_user_has_property_access(auth.uid(), d.property_id)
    )
  );

COMMENT ON POLICY "guest documents property staff read" ON storage.objects IS
  'Staff can read guest identity documents only when the linked document belongs to an accessible StayNas property. Upload/delete remains server-only.';


-- Remove legacy global staff policies. PostgreSQL permissive policies are ORed,
-- so adding a property-scoped policy alone does not constrain an older FOR ALL policy.
DROP POLICY IF EXISTS "Guest PII staff manage guest documents" ON public.guest_documents;
DROP POLICY IF EXISTS "Staff manage guest documents" ON public.guest_documents;
DROP POLICY IF EXISTS guest_documents_property_staff_read ON public.guest_documents;
DROP POLICY IF EXISTS guest_documents_property_staff_manage ON public.guest_documents;
CREATE POLICY guest_documents_property_staff_read
  ON public.guest_documents FOR SELECT TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
  );
CREATE POLICY guest_documents_property_staff_update
  ON public.guest_documents FOR UPDATE TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
  )
  WITH CHECK (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
  );
REVOKE INSERT, DELETE ON public.guest_documents FROM authenticated;
GRANT SELECT, UPDATE ON public.guest_documents TO authenticated;

DROP POLICY IF EXISTS "Guest PII staff manage guest checkins" ON public.guest_checkins;
DROP POLICY IF EXISTS "Staff manage guest checkins" ON public.guest_checkins;
DROP POLICY IF EXISTS guest_checkins_property_staff_read ON public.guest_checkins;
DROP POLICY IF EXISTS guest_checkins_property_staff_manage ON public.guest_checkins;
CREATE POLICY guest_checkins_property_staff_read
  ON public.guest_checkins FOR SELECT TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = guest_checkins.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );
CREATE POLICY guest_checkins_property_staff_update
  ON public.guest_checkins FOR UPDATE TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = guest_checkins.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  )
  WITH CHECK (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = guest_checkins.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );
REVOKE INSERT, DELETE ON public.guest_checkins FROM authenticated;
GRANT SELECT, UPDATE ON public.guest_checkins TO authenticated;

DROP POLICY IF EXISTS "Staff read checkin activity" ON public.guest_checkin_activity;
DROP POLICY IF EXISTS guest_checkin_activity_property_staff_read ON public.guest_checkin_activity;
CREATE POLICY guest_checkin_activity_property_staff_read
  ON public.guest_checkin_activity FOR SELECT TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = guest_checkin_activity.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );

DROP POLICY IF EXISTS "Ops staff manage arrival information" ON public.arrival_information;
DROP POLICY IF EXISTS "Staff manage arrival information" ON public.arrival_information;
DROP POLICY IF EXISTS arrival_information_property_staff_manage ON public.arrival_information;
CREATE POLICY arrival_information_property_staff_read
  ON public.arrival_information FOR SELECT TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = arrival_information.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );
CREATE POLICY arrival_information_property_staff_update
  ON public.arrival_information FOR UPDATE TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = arrival_information.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  )
  WITH CHECK (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = arrival_information.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );
REVOKE INSERT, DELETE ON public.arrival_information FROM authenticated;
GRANT SELECT, UPDATE ON public.arrival_information TO authenticated;

DROP POLICY IF EXISTS "Staff can view arrival passes" ON public.arrival_passes;
CREATE POLICY arrival_passes_property_staff_read
  ON public.arrival_passes FOR SELECT TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = arrival_passes.booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );

-- SECURITY DEFINER scan functions must enforce the same property boundary
-- themselves; RLS does not constrain their table reads.
ALTER FUNCTION public.arrival_pass_validate(text, jsonb)
  RENAME TO arrival_pass_validate_unscoped;

REVOKE ALL ON FUNCTION public.arrival_pass_validate_unscoped(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.arrival_pass_validate(
  _pass_token text,
  _client jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _property_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_any_role(auth.uid(), ARRAY['owner','manager','reception']::public.app_role[])
     OR NOT public.is_any_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT b.property_id INTO _property_id
  FROM public.arrival_passes p
  JOIN public.bookings b ON b.id = p.booking_id
  WHERE p.token = _pass_token;

  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id) THEN
    RAISE EXCEPTION 'Arrival pass not found or property access denied';
  END IF;

  RETURN public.arrival_pass_validate_unscoped(_pass_token, COALESCE(_client, '{}'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.arrival_pass_validate(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrival_pass_validate(text, jsonb) TO authenticated;

-- Front desk is the only actor that completes the reservation lifecycle.
-- Guest submission records the journey; it must never mark the booking checked in.
CREATE OR REPLACE FUNCTION public.checkin_submit(
  _token text,
  _answer text,
  _guest jsonb,
  _arrival jsonb,
  _final boolean DEFAULT true,
  _session_id text DEFAULT NULL,
  _client jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c public.guest_checkins%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _norm text;
  _surname text;
  _name text;
  _email text;
  _timeout interval := interval '30 minutes';
  _e jsonb;
  _prev_fp text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid check-in link');
  END IF;
  IF _session_id IS NULL OR length(trim(_session_id)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'code','session','message','Verify your reservation before submitting check-in.');
  END IF;

  SELECT * INTO _c FROM public.guest_checkins WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Invalid check-in link');
  END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _c.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Reservation not found');
  END IF;

  IF _c.locked_at IS NOT NULL OR _c.status IN ('submitted','under_review','approved') THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_locked', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','locked','message','This check-in has already been submitted');
  END IF;
  IF _c.expires_at <= now() THEN
    UPDATE public.guest_checkins SET status='expired', updated_at=now() WHERE id=_c.id;
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_expired', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','expired','message','This check-in link has expired');
  END IF;
  IF _c.session_id IS DISTINCT FROM _session_id THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_session', _session_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code','session','message','Your check-in session is no longer active. Please verify again.');
  END IF;
  IF COALESCE(_c.last_activity_at, _c.session_started_at) IS NULL
     OR COALESCE(_c.last_activity_at, _c.session_started_at) <= now() - _timeout THEN
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

  _e := public.checkin_eligibility(_b.id);
  IF NOT COALESCE((_e->>'ok')::boolean, false) THEN
    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_ineligible', _session_id, _e);
    RETURN jsonb_build_object('ok', false, 'code', _e->>'code', 'message', _e->>'message');
  END IF;

  IF _final THEN
    _prev_fp := _c.reservation_snapshot->>'fingerprint';
    IF _prev_fp IS NOT NULL AND _prev_fp <> (_e->'snapshot'->>'fingerprint') THEN
      UPDATE public.guest_checkins
      SET reservation_snapshot = _e->'snapshot', updated_at = now()
      WHERE id = _c.id;
      PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit_blocked_reservation_changed', _session_id,
        jsonb_build_object('before', _c.reservation_snapshot, 'after', _e->'snapshot'));
      RETURN jsonb_build_object('ok', false, 'code','reservation_changed',
        'message','Your reservation changed while you were checking in. Review the refreshed details and submit again.',
        'snapshot', _e->'snapshot');
    END IF;
  END IF;

  _name := NULLIF(trim(COALESCE(_guest->>'full_name','')), '');
  _email := NULLIF(lower(trim(COALESCE(_guest->>'email',''))), '');
  IF _final THEN
    IF _name IS NULL OR length(_name) < 2 THEN
      RETURN jsonb_build_object('ok', false, 'code','validation','message','Full name is required');
    END IF;
    IF _email IS NULL OR _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN jsonb_build_object('ok', false, 'code','validation','message','A valid email is required');
    END IF;
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
    INSERT INTO public.ops_tasks (property_id, booking_id, task_type, title, description, priority, due_at)
    VALUES (_b.property_id, _b.id, 'checkin_review', 'Review online check-in — ' || _b.reference,
      'Guest submitted online check-in details. Front desk must verify documents and confirm arrival.',
      2, (_b.check_in - interval '1 day')::timestamptz);

    PERFORM public.checkin_log_activity(_c.id, _b.id, 'submit', _session_id,
      jsonb_build_object('device', _client->>'device', 'timezone', _client->>'timezone'));

    RETURN jsonb_build_object('ok', true, 'status', 'submitted', 'room_ready', false,
      'message', 'Check-in submitted. Reception will verify your documents and confirm arrival.');
  END IF;

  PERFORM public.checkin_log_activity(_c.id, _b.id, 'draft_saved', _session_id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END;
$function$;

-- Staff arrival confirmation now uses the Phase 3 lifecycle RPC, not a parallel
-- direct UPDATE of bookings.status or a second room-allocation implementation.
CREATE OR REPLACE FUNCTION public.arrival_pass_confirm(
  _pass_token text,
  _client jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _v jsonb;
  _p public.arrival_passes%ROWTYPE;
  _b public.bookings%ROWTYPE;
  _transition jsonb;
  _unit_label text;
BEGIN
  _v := public.arrival_pass_validate(_pass_token, COALESCE(_client, '{}'::jsonb));
  IF NOT COALESCE((_v->>'ok')::boolean, false) THEN
    RETURN _v;
  END IF;

  SELECT * INTO _p FROM public.arrival_passes WHERE token = _pass_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','invalid','message','Arrival pass not found');
  END IF;
  SELECT * INTO _b FROM public.bookings WHERE id = _p.booking_id FOR UPDATE;

  IF _b.status::text <> 'checked_in' THEN
    _transition := public.staynas_transition_booking(_b.id, 'checked_in', 'Arrival confirmed from digital arrival pass');
    IF NOT COALESCE((_transition->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'code','transition_failed','message','Arrival could not be confirmed');
    END IF;
  END IF;

  SELECT unit_label INTO _unit_label
  FROM public.room_states WHERE booking_id = _b.id AND room_id = _b.room_id
  ORDER BY unit_label LIMIT 1;

  UPDATE public.guest_checkins
  SET status = 'approved'::public.checkin_status,
      room_state_id = (
        SELECT id FROM public.room_states
        WHERE booking_id = _b.id AND room_id = _b.room_id
        ORDER BY unit_label LIMIT 1
      ),
      checked_in_at = COALESCE(checked_in_at, now()),
      updated_at = now()
  WHERE id = _p.checkin_id;

  UPDATE public.arrival_passes
  SET status = 'used', used_at = COALESCE(used_at, now()), used_by = auth.uid(), updated_at = now()
  WHERE id = _p.id AND status = 'active';

  PERFORM public.checkin_log_activity(_p.checkin_id, _b.id, 'arrival_pass_confirmed', NULL,
    jsonb_build_object('pass_id', _p.id, 'unit_label', _unit_label, 'lifecycle', _transition));

  INSERT INTO public.activity_logs (
    actor_id, action, module, entity_type, entity_id, entity_label, severity, metadata, new_value
  ) VALUES (
    auth.uid(), 'arrival_pass.confirmed', 'operations', 'booking', _b.id, _b.reference,
    'audit', jsonb_build_object('pass_id', _p.id, 'property_id', _b.property_id,
      'device', _client->>'device', 'timezone', _client->>'timezone'),
    jsonb_build_object('arrival', 'confirmed', 'status', 'checked_in', 'unit_label', _unit_label)
  );

  PERFORM public.log_calendar_event(
    'reservation.checked_in', _b.room_id, _b.id, NULL, _b.check_in, _b.check_out,
    jsonb_build_object('reference', _b.reference, 'source', 'arrival_pass', 'unit_label', _unit_label)
  );

  RETURN jsonb_build_object(
    'ok', true, 'code','confirmed', 'message','Arrival confirmed',
    'reservation', _v->'reservation',
    'sync', jsonb_build_object('ok', true, 'unit_label', _unit_label),
    'lifecycle', _transition
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.arrival_pass_confirm(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrival_pass_confirm(text, jsonb) TO authenticated;


-- Fail the migration if any broad legacy policy or anonymous staff scanner
-- execution path remains in place.
DO $phase4_assert$
DECLARE
  _submit_definition text;
  _confirm_definition text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('guest_documents','guest_checkins','guest_checkin_activity','arrival_information','arrival_passes')
      AND policyname IN (
        'Guest PII staff manage guest documents',
        'Staff manage guest documents',
        'Guest PII staff manage guest checkins',
        'Staff manage guest checkins',
        'Staff read checkin activity',
        'Ops staff manage arrival information',
        'Staff manage arrival information',
        'Staff can view arrival passes'
      )
  ) THEN
    RAISE EXCEPTION 'Phase 4 security assertion failed: legacy global staff policy remains';
  END IF;

  IF has_function_privilege('anon', 'public.arrival_pass_validate(text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.arrival_pass_confirm(text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.arrival_pass_validate_unscoped(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 4 security assertion failed: anonymous arrival-pass staff execution remains';
  END IF;

  _submit_definition := pg_get_functiondef('public.checkin_submit(text,text,jsonb,jsonb,boolean,text,jsonb)'::regprocedure);
  _confirm_definition := pg_get_functiondef('public.arrival_pass_confirm(text,jsonb)'::regprocedure);

  IF position('checkin_sync_reservation' IN _submit_definition) > 0 THEN
    RAISE EXCEPTION 'Phase 4 lifecycle assertion failed: guest submission still invokes privileged room sync';
  END IF;
  IF position('staynas_transition_booking' IN _confirm_definition) = 0 THEN
    RAISE EXCEPTION 'Phase 4 lifecycle assertion failed: front-desk confirmation does not use Phase 3 lifecycle RPC';
  END IF;
END;
$phase4_assert$;
