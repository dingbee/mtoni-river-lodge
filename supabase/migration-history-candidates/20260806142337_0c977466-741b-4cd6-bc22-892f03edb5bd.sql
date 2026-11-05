DO $$
DECLARE
  r_std uuid := '3b476463-ea58-4d5b-abb4-ad460e844a8b';
  unit1 uuid := '29e99ca2-0778-42f3-a6a6-23ccbc3cb319';
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid;
  c1 uuid; c2 uuid; c4 uuid;
BEGIN
  INSERT INTO public.bookings (reference, room_id, check_in, check_out, nights, adults, guest_name, guest_email, guest_phone, country, status, payment_status, subtotal, total, source, special_requests)
  VALUES ('TEST-JS-0001', r_std, '2026-08-12', '2026-08-15', 3, 2, 'John Smith', 'john.smith@example.com', '+255700000001', 'United Kingdom', 'confirmed', 'deposit_paid', 780, 780, 'test-data', 'Late arrival, quiet room please')
  RETURNING id INTO b1;

  INSERT INTO public.bookings (reference, room_id, check_in, check_out, nights, adults, guest_name, guest_email, country, status, payment_status, subtotal, total, source)
  VALUES ('TEST-AY-0002', r_std, '2026-08-08', '2026-08-10', 2, 1, 'Amina Yusuf', 'amina.yusuf@example.com', 'Tanzania', 'confirmed', 'paid', 520, 520, 'test-data')
  RETURNING id INTO b2;

  INSERT INTO public.bookings (reference, room_id, check_in, check_out, nights, adults, guest_name, guest_email, country, status, payment_status, subtotal, total, source)
  VALUES ('TEST-PM-0003', r_std, '2026-08-09', '2026-08-11', 2, 2, 'Peter Meyer', 'peter.meyer@example.com', 'Germany', 'pending', 'unpaid', 520, 520, 'test-data')
  RETURNING id INTO b3;

  INSERT INTO public.bookings (reference, room_id, check_in, check_out, nights, adults, guest_name, guest_email, country, status, payment_status, subtotal, total, source)
  VALUES ('TEST-LN-0004', r_std, '2026-08-10', '2026-08-12', 2, 2, 'Lena Novak', 'lena.novak@example.com', 'Czechia', 'confirmed', 'deposit_paid', 520, 520, 'test-data')
  RETURNING id INTO b4;

  INSERT INTO public.bookings (reference, room_id, check_in, check_out, nights, adults, guest_name, guest_email, country, status, payment_status, subtotal, total, source, cancelled_at)
  VALUES ('TEST-OS-0005', r_std, '2026-08-11', '2026-08-13', 2, 1, 'Omar Said', 'omar.said@example.com', 'Tanzania', 'cancelled', 'refunded', 520, 520, 'test-data', now())
  RETURNING id INTO b5;

  INSERT INTO public.guest_checkins (booking_id, token, status, expires_at, started_at, submitted_at, signature_name, terms_accepted_at)
  VALUES (b1, 'test-token-js-0001', 'submitted', '2026-08-15', now() - interval '2 hours', now() - interval '1 hour', 'John Smith', now() - interval '1 hour')
  RETURNING id INTO c1;

  INSERT INTO public.guest_checkins (booking_id, token, status, expires_at, started_at, submitted_at, signature_name, terms_accepted_at)
  VALUES (b2, 'test-token-ay-0002', 'submitted', '2026-08-10', now() - interval '5 hours', now() - interval '4 hours', 'Amina Yusuf', now() - interval '4 hours')
  RETURNING id INTO c2;

  INSERT INTO public.guest_checkins (booking_id, token, status, expires_at, started_at, draft_step, last_activity_at)
  VALUES (b4, 'test-token-ln-0004', 'in_progress', '2026-08-12', now() - interval '30 minutes', 1, now() - interval '20 minutes')
  RETURNING id INTO c4;

  INSERT INTO public.arrival_information (checkin_id, booking_id, estimated_arrival_time, arrival_date, arrival_mode, transfer_required, transfer_notes, dietary_requirements, special_requests, emergency_contact_name, emergency_contact_phone)
  VALUES (c1, b1, '19:30', '2026-08-12', 'road', true, 'Pickup from Moshi town', 'Vegetarian', 'Late arrival, quiet room please', 'Sarah Smith', '+441234567890');

  INSERT INTO public.arrival_information (checkin_id, booking_id, estimated_arrival_time, arrival_date, arrival_mode, transfer_required)
  VALUES (c2, b2, '14:00', '2026-08-08', 'own', false);

  INSERT INTO public.guest_documents (booking_id, checkin_id, kind, label, status, file_name, storage_path, mime_type, file_size, document_number, document_expiry, uploaded_by_guest)
  VALUES (b1, c1, 'passport', 'Passport', 'pending', 'passport-john-smith.pdf', b1::text || '/passport-test.pdf', 'application/pdf', 204800, 'GB1234567', '2031-05-01', true);

  UPDATE public.room_states
     SET state = 'reserved', booking_id = b1, state_note = 'Reserved for TEST-JS-0001'
   WHERE id = unit1;
END $$;