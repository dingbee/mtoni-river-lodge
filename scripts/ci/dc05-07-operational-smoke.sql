-- DC-05.07 operational integration smoke test. Disposable PostgreSQL only.
BEGIN;

DO $test$
DECLARE
  v_org uuid:='07070000-0000-4000-8000-000000000001';
  v_property uuid:='07070000-0000-4000-8000-000000000002';
  v_user uuid:='07070000-0000-4000-8000-000000000003';
  v_account uuid:='07070000-0000-4000-8000-000000000004';
  v_grant uuid:='07070000-0000-4000-8000-000000000005';
  v_connection uuid:='07070000-0000-4000-8000-000000000006';
  v_inbox uuid:='07070000-0000-4000-8000-000000000007';
  v_type uuid:='07070000-0000-4000-8000-000000000008';
  v_room uuid:='07070000-0000-4000-8000-000000000009';
  v_booking uuid:='07070000-0000-4000-8000-000000000010';
  v_room_state uuid:='07070000-0000-4000-8000-000000000011';
  v_link uuid:='07070000-0000-4000-8000-000000000012';
  v_guest_id uuid;
  v_allocation_status text;
  v_integration_status text;
  v_task_count integer;
  v_room_state_booking uuid;
  v_booking_status text;
BEGIN
  INSERT INTO public.staynas_organisations(id,slug)
  VALUES(v_org,'dc0507-fixture');
  INSERT INTO public.staynas_properties(id,organisation_id,slug,status,timezone)
  VALUES(v_property,v_org,'dc0507-fixture','active','Africa/Dar_es_Salaam');
  INSERT INTO auth.users(id) VALUES(v_user);
  INSERT INTO public.staynas_distribution_external_accounts(
    id,organisation_id,provider_key,external_account_reference,environment,credential_reference,lifecycle
  ) VALUES(v_account,v_org,'airbnb','dc0507-account','sandbox',gen_random_uuid(),'connected');
  INSERT INTO public.staynas_distribution_account_grants(
    id,organisation_id,property_id,external_account_id,provider_key,environment,
    grant_status,granted_capabilities,granted_by
  ) VALUES(v_grant,v_org,v_property,v_account,'airbnb','sandbox','active',
    ARRAY['reservation.import','reservation.update','reservation.cancel'],v_user);
  INSERT INTO public.staynas_distribution_connections(
    id,organisation_id,property_id,account_grant_id,external_account_id,provider_key,
    adapter_version,environment,lifecycle,created_by
  ) VALUES(v_connection,v_org,v_property,v_grant,v_account,'airbnb','1.0.0','sandbox','connected',v_user);
  INSERT INTO public.staynas_room_catalogue_types(id,status) VALUES(v_type,'active');
  INSERT INTO public.rooms(
    id,property_id,catalogue_type_id,slug,name,status,currency,total_units,
    capacity_adults,capacity_children,max_occupancy,included_guests,base_price
  ) VALUES(v_room,v_property,v_type,'dc0507-room','DC-05.07 Room','active','USD',1,2,2,4,2,100);
  INSERT INTO public.room_states(id,room_id,unit_label,state)
  VALUES(v_room_state,v_room,'DC0507-01','vacant_clean');

  INSERT INTO public.bookings(
    id,reference,room_id,property_id,check_in,check_out,nights,adults,children,
    guest_name,guest_email,currency,source,payment_method,payment_provider,
    subtotal,extras_total,taxes,tax_addition,tax_breakdown,total,deposit_amount,
    balance_amount,balance_due,status,payment_status,paid_amount
  ) VALUES(
    v_booking,'DC0507-BOOKING',v_room,v_property,'2026-12-10','2026-12-12',2,2,0,
    'Test Guest','dc0507@example.test','USD','channel',NULL,'channel',
    200,0,0,0,'[]'::jsonb,200,0,200,200,'pending','unpaid',0
  ) RETURNING guest_id INTO v_guest_id;

  IF v_guest_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.guests WHERE id=v_guest_id AND lower(email)='dc0507@example.test'
  ) THEN RAISE EXCEPTION 'Guest CRM profile was not linked to canonical booking'; END IF;

  INSERT INTO public.staynas_distribution_webhook_inbox(
    id,organisation_id,property_id,connection_id,account_grant_id,external_account_id,
    provider_key,environment,provider_event_id,event_type,payload_fingerprint,
    normalized_event,correlation_id
  ) VALUES(
    v_inbox,v_org,v_property,v_connection,v_grant,v_account,'airbnb','sandbox',
    'dc0507-event-1','reservation.created',repeat('a',64),
    jsonb_build_object('externalReservationId','dc0507-reservation-1','providerStatus','confirmed'),
    'dc0507-correlation'
  );

  INSERT INTO public.staynas_distribution_reservation_links(
    id,organisation_id,property_id,connection_id,account_grant_id,external_account_id,
    provider_key,environment,external_reservation_id,booking_id,source_inbox_id,
    source_provider_event_id,provider_status
  ) VALUES(
    v_link,v_org,v_property,v_connection,v_grant,v_account,'airbnb','sandbox',
    'dc0507-reservation-1',v_booking,v_inbox,'dc0507-event-1','confirmed'
  );

  SELECT status::text,payment_status,guest_id
    INTO v_booking_status,v_integration_status,v_guest_id
  FROM public.bookings WHERE id=v_booking;
  IF v_booking_status<>'confirmed' OR v_integration_status<>'unpaid'
     OR v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Channel confirmation did not preserve reservation/payment/guest state';
  END IF;

  SELECT integration_status INTO v_integration_status
  FROM public.staynas_distribution_operational_reservations WHERE booking_id=v_booking;
  SELECT allocation_status INTO v_allocation_status
  FROM public.staynas_distribution_room_allocations WHERE booking_id=v_booking;
  IF v_integration_status<>'integrated' OR v_allocation_status<>'reserved' THEN
    RAISE EXCEPTION 'Channel reservation did not reach operational projection and room allocation';
  END IF;

  SELECT count(*) INTO v_task_count FROM public.ops_tasks
  WHERE booking_id=v_booking AND task_type='channel_reservation_arrival';
  IF v_task_count<>1 THEN RAISE EXCEPTION 'Expected exactly one channel arrival task'; END IF;

  -- Replay the same integration operation. It must update the projection, not
  -- create a second task, allocation or operational reservation.
  PERFORM public.staynas_integrate_distribution_reservation(v_link);
  SELECT count(*) INTO v_task_count FROM public.ops_tasks
  WHERE booking_id=v_booking AND task_type='channel_reservation_arrival';
  IF v_task_count<>1
     OR (SELECT count(*) FROM public.staynas_distribution_room_allocations WHERE booking_id=v_booking)<>1
     OR (SELECT count(*) FROM public.staynas_distribution_operational_reservations WHERE booking_id=v_booking)<>1 THEN
    RAISE EXCEPTION 'Operational integration replay created duplicate downstream records';
  END IF;

  -- Staff check-in must bind the exact allocated physical room, not an arbitrary
  -- room-state row. The shared lifecycle core completes the occupied transition.
  UPDATE public.bookings SET status='checked_in' WHERE id=v_booking;
  SELECT booking_id INTO v_room_state_booking FROM public.room_states WHERE id=v_room_state;
  SELECT allocation_status INTO v_allocation_status
  FROM public.staynas_distribution_room_allocations WHERE booking_id=v_booking;
  IF v_room_state_booking IS DISTINCT FROM v_booking OR v_allocation_status<>'checked_in' THEN
    RAISE EXCEPTION 'Check-in did not bind the reserved physical room';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='staynas_distribution_operational_reservations'
      AND policyname='staynas_distribution_operational_property_read'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='staynas_distribution_financial_evidence'
      AND policyname='staynas_distribution_financial_evidence_property_read'
  ) THEN
    RAISE EXCEPTION 'Operational or finance evidence property-read policy is missing';
  END IF;
END
$test$;

ROLLBACK;
