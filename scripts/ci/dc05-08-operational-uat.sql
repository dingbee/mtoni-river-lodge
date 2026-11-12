-- DC-05.08 operational UAT: channel checkout -> HK execution -> inspection -> room ready.
-- Disposable PostgreSQL only. Requires DC-05.07 and existing HK-S1..S4/S6 migrations.
\set ON_ERROR_STOP on
BEGIN;

DO $uat$
DECLARE
  v_org uuid:='08080000-0000-4000-8000-000000000001';
  v_property uuid:='08080000-0000-4000-8000-000000000002';
  v_room_type uuid:='08080000-0000-4000-8000-000000000003';
  v_room uuid:='08080000-0000-4000-8000-000000000004';
  v_room_state uuid:='08080000-0000-4000-8000-000000000005';
  v_booking uuid:='08080000-0000-4000-8000-000000000006';
  v_housekeeper uuid:='08080000-0000-4000-8000-000000000007';
  v_supervisor uuid:='08080000-0000-4000-8000-000000000008';
  v_task uuid;
  v_reclean_task uuid;
  v_inspection uuid;
  v_checklist jsonb;
BEGIN
  INSERT INTO public.staynas_organisations(id,slug)
  VALUES(v_org,'dc0508-uat');
  INSERT INTO public.staynas_properties(id,organisation_id,slug,status,timezone)
  VALUES(v_property,v_org,'dc0508-uat','active','Africa/Dar_es_Salaam');
  INSERT INTO auth.users(id,email) VALUES
    (v_housekeeper,'dc0508-housekeeper@example.test'),
    (v_supervisor,'dc0508-supervisor@example.test');
  INSERT INTO public.user_roles(user_id,role) VALUES
    (v_housekeeper,'housekeeping'),
    (v_supervisor,'manager');

  INSERT INTO public.staynas_room_catalogue_types(id,status)
  VALUES(v_room_type,'active');
  INSERT INTO public.rooms(
    id,property_id,catalogue_type_id,slug,name,status,currency,total_units,
    capacity_adults,capacity_children,max_occupancy,included_guests,base_price
  ) VALUES(
    v_room,v_property,v_room_type,'dc0508-room','DC-05.08 UAT Room','active',
    'TZS',1,2,2,4,2,250000
  );
  INSERT INTO public.room_states(id,room_id,unit_label,state)
  VALUES(v_room_state,v_room,'DC0508-01','vacant_dirty');

  INSERT INTO public.bookings(
    id,reference,room_id,property_id,check_in,check_out,nights,adults,children,
    guest_name,guest_email,currency,source,payment_method,payment_provider,
    subtotal,extras_total,taxes,tax_addition,tax_breakdown,total,deposit_amount,
    balance_amount,balance_due,status,payment_status,paid_amount
  ) VALUES(
    v_booking,'DC0508-CHANNEL',v_room,v_property,'2026-11-05','2026-11-07',2,2,0,
    'DC-05.08 Channel Guest','dc0508-guest@example.test','TZS','channel',NULL,'channel',
    500000,0,0,0,'[]'::jsonb,500000,0,500000,500000,'completed','unpaid',0
  );

  INSERT INTO public.ops_tasks(
    property_id,booking_id,room_state_id,task_type,category,title,description,
    priority,status,due_at
  ) VALUES(
    v_property,v_booking,v_room_state,'channel_housekeeping_turnover','housekeeping',
    'Turn over DC0508-01 after channel departure',
    'DC-05.08 UAT: clean, replenish and inspect the channel guest room.',
    2,'pending',now()
  ) RETURNING id INTO v_task;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_tasks t
    JOIN public.bookings b ON b.id=t.booking_id
    JOIN public.room_states rs ON rs.id=t.room_state_id
    WHERE t.id=v_task AND b.source='channel'
      AND t.category='housekeeping' AND rs.state='vacant_dirty'
      AND rs.room_id=v_room AND t.property_id=v_property
  ) THEN
    RAISE EXCEPTION 'Channel departure did not produce a correctly scoped physical-room turnover task';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_housekeeper::text,true);
  PERFORM public.housekeeping_claim_task(v_task,'dc0508-claim-001');
  PERFORM public.housekeeping_claim_task(v_task,'dc0508-claim-001');
  PERFORM public.housekeeping_start_task(v_task,'dc0508-start-001');
  PERFORM public.housekeeping_start_task(v_task,'dc0508-start-001');

  IF (SELECT status::text FROM public.ops_tasks WHERE id=v_task)<>'in_progress'
     OR (SELECT assignee_id FROM public.ops_tasks WHERE id=v_task)<>v_housekeeper THEN
    RAISE EXCEPTION 'Housekeeping claim/start workflow did not retain its idempotent staff assignment';
  END IF;

  PERFORM public.housekeeping_complete_task(
    v_task,'Initial cleaning completed; supervisor inspection requested.','dc0508-clean-001'
  );
  IF (SELECT state::text FROM public.room_states WHERE id=v_room_state)<>'inspection'
     OR (SELECT status::text FROM public.ops_tasks WHERE id=v_task)<>'completed' THEN
    RAISE EXCEPTION 'Cleaning completion did not move room into governed inspection state';
  END IF;
  SELECT id INTO v_inspection FROM public.housekeeping_inspections
  WHERE room_state_id=v_room_state AND status='pending';
  IF v_inspection IS NULL THEN RAISE EXCEPTION 'Cleaning completion did not create inspection'; END IF;

  v_checklist:=jsonb_build_array(
    jsonb_build_object('key','bedroom','passed',true),
    jsonb_build_object('key','bathroom','passed',false),
    jsonb_build_object('key','linen','passed',true),
    jsonb_build_object('key','amenities','passed',true),
    jsonb_build_object('key','floor','passed',true),
    jsonb_build_object('key','fixtures','passed',true),
    jsonb_build_object('key','waste','passed',true),
    jsonb_build_object('key','overall','passed',true)
  );
  PERFORM set_config('request.jwt.claim.sub',v_supervisor::text,true);
  PERFORM public.housekeeping_submit_inspection(
    v_inspection,v_checklist,false,'Bathroom restock incomplete.','dc0508-inspect-fail-001'
  );

  IF (SELECT state::text FROM public.room_states WHERE id=v_room_state)<>'vacant_dirty'
     OR (SELECT status FROM public.housekeeping_inspections WHERE id=v_inspection)<>'failed' THEN
    RAISE EXCEPTION 'Failed inspection incorrectly released room as ready';
  END IF;
  SELECT id INTO v_reclean_task FROM public.ops_tasks
  WHERE booking_id=v_booking AND task_type='housekeeping_reclean'
    AND category='housekeeping' AND status='pending'
  ORDER BY created_at DESC LIMIT 1;
  IF v_reclean_task IS NULL THEN RAISE EXCEPTION 'Failed inspection did not create a re-clean task'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_housekeeper::text,true);
  PERFORM public.housekeeping_claim_task(v_reclean_task,'dc0508-claim-002');
  PERFORM public.housekeeping_start_task(v_reclean_task,'dc0508-start-002');
  PERFORM public.housekeeping_complete_task(
    v_reclean_task,'Bathroom restocked and re-clean completed.','dc0508-clean-002'
  );

  SELECT id INTO v_inspection FROM public.housekeeping_inspections
  WHERE room_state_id=v_room_state AND status='pending';
  IF v_inspection IS NULL THEN RAISE EXCEPTION 'Re-clean did not create a second inspection'; END IF;

  v_checklist:=jsonb_build_array(
    jsonb_build_object('key','bedroom','passed',true),
    jsonb_build_object('key','bathroom','passed',true),
    jsonb_build_object('key','linen','passed',true),
    jsonb_build_object('key','amenities','passed',true),
    jsonb_build_object('key','floor','passed',true),
    jsonb_build_object('key','fixtures','passed',true),
    jsonb_build_object('key','waste','passed',true),
    jsonb_build_object('key','overall','passed',true)
  );
  PERFORM set_config('request.jwt.claim.sub',v_supervisor::text,true);
  PERFORM public.housekeeping_submit_inspection(
    v_inspection,v_checklist,true,'All room-readiness checks passed.','dc0508-inspect-pass-001'
  );

  IF (SELECT state::text FROM public.room_states WHERE id=v_room_state)<>'vacant_clean'
     OR (SELECT status FROM public.housekeeping_inspections WHERE id=v_inspection)<>'passed'
     OR (SELECT count(*) FROM public.housekeeping_inspections
         WHERE room_state_id=v_room_state AND status='failed')<>1
     OR (SELECT count(*) FROM public.housekeeping_inspections
         WHERE room_state_id=v_room_state AND status='passed')<>1
     OR (SELECT count(*) FROM public.housekeeping_transition_log
         WHERE room_state_id=v_room_state AND to_state IN ('inspection','vacant_dirty','vacant_clean'))<4 THEN
    RAISE EXCEPTION 'Housekeeping re-clean and supervisor inspection did not finish with an auditable ready room';
  END IF;

  IF (SELECT payment_status FROM public.bookings WHERE id=v_booking)<>'unpaid'
     OR (SELECT paid_amount FROM public.bookings WHERE id=v_booking)<>0
     OR (SELECT currency FROM public.bookings WHERE id=v_booking)<>'TZS' THEN
    RAISE EXCEPTION 'Housekeeping execution altered channel booking financial state or currency';
  END IF;
END
$uat$;

ROLLBACK;
