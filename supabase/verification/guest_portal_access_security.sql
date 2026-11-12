-- SN-GPA-01 ephemeral PostgreSQL migration and authorization verification.
-- Requires guest_portal_access_bootstrap.sql and the migration to have been applied.

DO $$
DECLARE
  v_a_org uuid := '10000000-0000-0000-0000-000000000001';
  v_b_org uuid := '10000000-0000-0000-0000-000000000002';
  v_a_property uuid := '20000000-0000-0000-0000-000000000001';
  v_b_property uuid := '20000000-0000-0000-0000-000000000002';
  v_user_a uuid := '30000000-0000-0000-0000-000000000001';
  v_user_b uuid := '30000000-0000-0000-0000-000000000002';
  v_user_c uuid := '30000000-0000-0000-0000-000000000003';
  v_guest_a uuid := '40000000-0000-0000-0000-000000000001';
  v_guest_b uuid := '40000000-0000-0000-0000-000000000002';
  v_guest_c uuid := '40000000-0000-0000-0000-000000000003';
  v_booking_a uuid := '50000000-0000-0000-0000-000000000001';
  v_booking_b uuid := '50000000-0000-0000-0000-000000000002';
  v_booking_b2 uuid := '50000000-0000-0000-0000-000000000003';
  v_booking_b3 uuid := '50000000-0000-0000-0000-000000000004';
  v_booking_a2 uuid := '50000000-0000-0000-0000-000000000005';
  v_booking_b4 uuid := '50000000-0000-0000-0000-000000000006';
  v_booking_a3 uuid := '50000000-0000-0000-0000-000000000007';
  v_session_1 uuid := '60000000-0000-0000-0000-000000000001';
  v_session_2 uuid := '60000000-0000-0000-0000-000000000002';
  v_session_3 uuid := '60000000-0000-0000-0000-000000000003';
  v_session_4 uuid := '60000000-0000-0000-0000-000000000004';
  v_session_5 uuid := '60000000-0000-0000-0000-000000000005';
  v_session_11 uuid := '60000000-0000-0000-0000-000000000011';
  v_session_12 uuid := '60000000-0000-0000-0000-000000000012';
  v_session_13 uuid := '60000000-0000-0000-0000-000000000013';
  v_occupant_lead jsonb;
  v_occupant_access jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_rotated jsonb;
  v_checkout jsonb;
  v_founder jsonb;
  v_first_id uuid;
  v_rotated_id uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user_a),(v_user_b),(v_user_c);
  INSERT INTO public.staynas_organisations(id,slug,name)
    VALUES (v_a_org,'founder-test','Founder Test'),(v_b_org,'tenant-b-test','Tenant B Test');
  INSERT INTO public.staynas_properties(id,organisation_id,name,status,timezone)
    VALUES
      (v_a_property,v_a_org,'Property A','active','Africa/Dar_es_Salaam'),
      (v_b_property,v_b_org,'Property B','active','Africa/Dar_es_Salaam');
  INSERT INTO public.staynas_property_members(property_id,user_id,status,role)
    VALUES
      (v_a_property,v_user_a,'active','reception'),
      (v_b_property,v_user_b,'active','reception'),
      (v_a_property,v_user_c,'active','reception');
  INSERT INTO public.user_roles(user_id,role)
    VALUES
      (v_user_a,'reception'),
      (v_user_b,'reception'),
      (v_user_c,'reception');
  INSERT INTO public.commercial_founder_admin_memberships(organisation_id,principal_id,status)
    VALUES (v_a_org,v_user_a,'active');
  INSERT INTO public.commercial_founder_tenant_config(singleton,founder_organisation_id)
    VALUES (true,v_a_org);

  INSERT INTO public.guests(id,full_name)
    VALUES (v_guest_a,'Guest A'),(v_guest_b,'Guest B'),(v_guest_c,'Registered Occupant C');
  INSERT INTO public.bookings(id,property_id,guest_id,status,check_out)
    VALUES
      (v_booking_a,v_a_property,v_guest_a,'checked_in',current_date + 2),
      (v_booking_b,v_b_property,v_guest_b,'checked_in',current_date + 2),
      (v_booking_b2,v_b_property,v_guest_b,'checked_in',current_date + 2),
      (v_booking_b3,v_b_property,v_guest_b,'checked_in',current_date + 2),
      (v_booking_a2,v_a_property,v_guest_a,'checked_in',current_date + 2),
      (v_booking_b4,v_b_property,v_guest_b,'checked_in',current_date + 2),
      (v_booking_a3,v_a_property,v_guest_a,'checked_in',current_date + 2);

  INSERT INTO public.ai_concierge_sessions(id,session_token,property_id,guest_id,guest_name,channel)
    VALUES
      (v_session_1,'session-test-1',v_a_property,v_guest_a,'Guest A','web'),
      (v_session_2,'session-test-2',v_a_property,v_guest_a,'Guest A','web'),
      (v_session_3,'session-test-3',v_a_property,v_guest_a,'Guest A','web'),
      (v_session_4,'session-test-4',v_a_property,v_guest_a,'Guest A','web'),
      (v_session_5,'session-test-5',v_b_property,v_guest_b,'Guest B','web'),
      ('60000000-0000-0000-0000-000000000010','session-test-10',v_b_property,v_guest_b,'Guest B','web'),
      (v_session_11,'session-test-11',v_a_property,v_guest_a,'Guest A','web'),
      (v_session_12,'session-test-12',v_a_property,v_guest_c,'Registered Occupant C','web'),
      (v_session_13,'session-test-13',v_a_property,v_guest_c,'Registered Occupant C','web');

  PERFORM set_config('request.jwt.claim.role','service_role',true);

  -- First issuance and retry: the second call must return the first credential,
  -- not rotate it or create another active credential.
  v_first := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a,v_guest_a,v_session_1,repeat('a',64),v_user_a,false
  );
  v_first_id := (v_first->>'access_id')::uuid;
  IF COALESCE((v_first->>'already_active')::boolean,true) THEN
    RAISE EXCEPTION 'Initial issuance unexpectedly reported an existing credential';
  END IF;

  v_retry := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a,v_guest_a,v_session_2,repeat('b',64),v_user_a,false
  );
  IF NOT COALESCE((v_retry->>'already_active')::boolean,false)
     OR (v_retry->>'access_id')::uuid IS DISTINCT FROM v_first_id THEN
    RAISE EXCEPTION 'Idempotent check-in retry did not preserve the active credential';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.staynas_guest_portal_access
  WHERE property_id=v_a_property AND booking_id=v_booking_a
    AND guest_id=v_guest_a AND status='active' AND revoked_at IS NULL;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one active credential, found %',v_count; END IF;

  -- Manual rotation must supersede the old credential and link the replacement.
  v_rotated := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a,v_guest_a,v_session_3,repeat('c',64),v_user_a,true
  );
  v_rotated_id := (v_rotated->>'access_id')::uuid;
  IF v_rotated_id = v_first_id THEN RAISE EXCEPTION 'Rotation reused the previous credential row'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=v_first_id AND status='superseded' AND superseded_by=v_rotated_id
  ) THEN RAISE EXCEPTION 'Previous credential was not superseded and linked'; END IF;

  v_count := public.staynas_revoke_guest_portal_access(v_a_property,v_booking_a,v_guest_a,v_user_a);
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=v_rotated_id AND status='revoked' AND revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Administrator revocation did not invalidate the active credential'; END IF;

  -- Checkout applies the property grace period. Early checkout shortens the
  -- scheduled expiry to actual checkout time + configured grace.
  UPDATE public.staynas_properties SET guest_portal_grace_minutes=60 WHERE id=v_a_property;
  v_checkout := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a,v_guest_a,v_session_4,repeat('d',64),v_user_a,false
  );
  UPDATE public.bookings SET status='completed' WHERE id=v_booking_a;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_checkout->>'access_id')::uuid
      AND status='active'
      AND expires_at > now()
      AND expires_at <= now() + interval '60 minutes'
      AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Checkout did not preserve access for the configured grace period'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access_events
    WHERE booking_id=v_booking_a AND event_type='checkout_grace_started'
  ) THEN RAISE EXCEPTION 'Checkout grace-start audit event missing'; END IF;

  -- A property transfer invalidates credentials scoped to the old property.
  INSERT INTO public.ai_concierge_sessions(id,session_token,property_id,guest_id,guest_name,channel)
    VALUES ('60000000-0000-0000-0000-000000000006','session-test-6',v_b_property,v_guest_b,'Guest B','web');
  v_founder := public.staynas_issue_guest_portal_access(
    v_b_property,v_booking_b,v_guest_b,'60000000-0000-0000-0000-000000000006',
    repeat('e',64),v_user_a,false
  );
  UPDATE public.bookings SET property_id=v_a_property WHERE id=v_booking_b;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_founder->>'access_id')::uuid AND status='revoked' AND revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Property transfer did not revoke old-property access'; END IF;

  -- Cancellation must revoke the credential independently of checkout.
  INSERT INTO public.ai_concierge_sessions(id,session_token,property_id,guest_id,guest_name,channel)
    VALUES ('60000000-0000-0000-0000-000000000007','session-test-7',v_b_property,v_guest_b,'Guest B','web');
  v_founder := public.staynas_issue_guest_portal_access(
    v_b_property,v_booking_b2,v_guest_b,'60000000-0000-0000-0000-000000000007',
    repeat('f',64),v_user_b,false
  );
  UPDATE public.bookings SET status='cancelled' WHERE id=v_booking_b2;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_founder->>'access_id')::uuid AND status='revoked' AND revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Cancellation did not revoke guest access'; END IF;

  -- A property with the default zero-minute grace expires immediately at checkout.
  v_checkout := public.staynas_issue_guest_portal_access(
    v_b_property,v_booking_b4,v_guest_b,'60000000-0000-0000-0000-000000000010',
    repeat('i',64),v_user_b,false
  );
  UPDATE public.bookings SET status='completed' WHERE id=v_booking_b4;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_checkout->>'access_id')::uuid AND status='expired' AND revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Zero-minute checkout grace did not expire access immediately'; END IF;

  -- Reversing a successful check-in also revokes access.
  INSERT INTO public.ai_concierge_sessions(id,session_token,property_id,guest_id,guest_name,channel)
    VALUES ('60000000-0000-0000-0000-000000000009','session-test-9',v_a_property,v_guest_a,'Guest A','web');
  v_checkout := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a2,v_guest_a,'60000000-0000-0000-0000-000000000009',
    repeat('h',64),v_user_a,false
  );
  UPDATE public.bookings SET status='confirmed' WHERE id=v_booking_a2;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_checkout->>'access_id')::uuid AND status='revoked' AND revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Check-in reversal did not revoke guest access'; END IF;

  -- Multiple registered guests can receive independent credentials on one booking.
  INSERT INTO public.staynas_booking_guest_occupants(property_id,booking_id,guest_id,created_by)
    VALUES (v_a_property,v_booking_a3,v_guest_c,v_user_a);
  v_occupant_lead := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a3,v_guest_a,v_session_11,repeat('j',64),v_user_a,false
  );
  v_occupant_access := public.staynas_issue_guest_portal_access(
    v_a_property,v_booking_a3,v_guest_c,v_session_12,repeat('k',64),v_user_a,false
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_occupant_access->>'access_id')::uuid AND guest_id=v_guest_c AND status='active'
  ) THEN RAISE EXCEPTION 'Registered occupant credential was not issued'; END IF;
  v_count := public.staynas_revoke_guest_portal_access(v_a_property,v_booking_a3,v_guest_c,v_user_a);
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access
    WHERE id=(v_occupant_lead->>'access_id')::uuid AND guest_id=v_guest_a AND status='active'
  ) THEN RAISE EXCEPTION 'Revoking one occupant affected the lead guest or failed to revoke occupant'; END IF;
  BEGIN
    INSERT INTO public.staynas_booking_guest_occupants(property_id,booking_id,guest_id,created_by)
      VALUES (v_a_property,v_booking_b3,v_guest_c,v_user_a);
    RAISE EXCEPTION 'Cross-property occupant relationship was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  UPDATE public.staynas_booking_guest_occupants SET status='removed'
    WHERE property_id=v_a_property AND booking_id=v_booking_a3 AND guest_id=v_guest_c;
  BEGIN
    PERFORM public.staynas_issue_guest_portal_access(
      v_a_property,v_booking_a3,v_guest_c,v_session_13,repeat('l',64),v_user_a,true
    );
    RAISE EXCEPTION 'Removed occupant was allowed to receive a credential';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- A property administrator cannot cross into another tenant's property.
  INSERT INTO public.ai_concierge_sessions(id,session_token,property_id,guest_id,guest_name,channel)
    VALUES ('60000000-0000-0000-0000-000000000008','session-test-8',v_b_property,v_guest_b,'Guest B','web');
  BEGIN
    PERFORM public.staynas_issue_guest_portal_access(
      v_b_property,v_booking_b3,v_guest_b,'60000000-0000-0000-0000-000000000008',
      repeat('g',64),v_user_c,false
    );
    RAISE EXCEPTION 'Cross-property issuance unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access_events
    WHERE property_id=v_a_property AND booking_id=v_booking_a AND event_type='superseded'
  ) THEN RAISE EXCEPTION 'Credential rotation audit event missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access_events
    WHERE property_id=v_a_property AND booking_id=v_booking_a AND event_type='activated'
  ) THEN RAISE EXCEPTION 'Credential activation audit event missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_guest_portal_access_events
    WHERE property_id=v_a_property AND booking_id=v_booking_a AND event_type='checkout_grace_started'
  ) THEN RAISE EXCEPTION 'Checkout grace audit event missing'; END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.staynas_guest_portal_access_events'::regclass AND relrowsecurity
  ) THEN RAISE EXCEPTION 'Access event RLS is not enabled'; END IF;

  IF has_table_privilege('anon','public.staynas_guest_portal_access_events','SELECT') THEN
    RAISE EXCEPTION 'anon can read credential audit events';
  END IF;
  IF has_table_privilege('authenticated','public.staynas_guest_portal_access_events','SELECT') THEN
    RAISE EXCEPTION 'authenticated can read credential audit events directly';
  END IF;
  IF has_function_privilege('anon','public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute credential issuance RPC';
  END IF;
  IF has_function_privilege('authenticated','public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute credential issuance RPC directly';
  END IF;
  IF NOT has_function_privilege('service_role','public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute credential issuance RPC';
  END IF;
  IF to_regclass('public.staynas_guest_portal_access_one_active_identity_uidx') IS NULL THEN
    RAISE EXCEPTION 'One-active-credential index is missing';
  END IF;
END
$$;
