-- NSC-05 end-to-end certification against the isolated CI bootstrap schema.
-- Creates real domain rows, exercises database triggers and recipient resolution,
-- verifies read/acknowledge/resolve, escalation and cross-property isolation, then rolls back.
BEGIN;

INSERT INTO public.staynas_organisations(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.staynas_properties(id, organisation_id, status) VALUES
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active');

INSERT INTO auth.users(id) VALUES
  ('33333333-3333-4333-8333-333333333333'), -- property manager
  ('44444444-4444-4444-8444-444444444444'), -- reception
  ('55555555-5555-4555-8555-555555555555'), -- housekeeper
  ('66666666-6666-4666-8666-666666666666'), -- finance
  ('77777777-7777-4777-8777-777777777777'), -- reservations
  ('88888888-8888-4888-8888-888888888888'); -- manager at another property

INSERT INTO public.staynas_property_members(property_id,user_id,role,status) VALUES
  ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','manager','active'),
  ('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','reception','active'),
  ('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555','housekeeping','active'),
  ('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','finance','active'),
  ('22222222-2222-4222-8222-222222222222','77777777-7777-4777-8777-777777777777','reservations','active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','88888888-8888-4888-8888-888888888888','manager','active');

SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);

INSERT INTO public.rooms(id,property_id)
VALUES ('99999999-9999-4999-8999-999999999999','22222222-2222-4222-8222-222222222222');
INSERT INTO public.room_states(id,room_id,property_id,unit_label,state)
VALUES ('12121212-1212-4212-8212-121212121212','99999999-9999-4999-8999-999999999999',
        '22222222-2222-4222-8222-222222222222','Room 01','vacant_clean');

-- The migration must safely backfill legacy notification tenant/property context.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.title='Legacy booking notification'
      AND n.property_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND n.organisation_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) THEN RAISE EXCEPTION 'Legacy booking notification property/organisation backfill failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.title='Legacy property notification'
      AND n.property_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND n.organisation_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) THEN RAISE EXCEPTION 'Legacy property metadata backfill failed'; END IF;
END $$;

-- The authenticated public RPC accepts only application-controlled sources;
-- internal database trigger ingress is not directly executable by clients.
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.staynas_publish_operational_notification(
      '22222222-2222-4222-8222-222222222222','operations.reservations','nsc-forged-source',
      'booking_created','operations.reservations','booking',NULL,
      '33333333-3333-4333-8333-333333333333',NULL,NULL,
      ARRAY['manager']::public.app_role[],'info','Forged alert','Must be rejected',NULL,'{}'::jsonb,NULL,now()
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Authenticated RPC accepted an untrusted operational source'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM nsc_private.staynas_publish_operational_notification(
      '22222222-2222-4222-8222-222222222222','operations.reservations','nsc-direct-private',
      'booking_created','operations.reservations','booking',NULL,
      '33333333-3333-4333-8333-333333333333',NULL,NULL,
      ARRAY['manager']::public.app_role[],'info','Direct private call','Must be rejected',NULL,'{}'::jsonb,NULL,now()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Authenticated client executed private notification ingress'; END IF;
END $$;
RESET ROLE;

-- Reservation + payment lifecycle. Both changes in one UPDATE must emit both events.
INSERT INTO public.bookings(id,property_id,reference,guest_name,status,payment_status)
VALUES ('13131313-1313-4313-8313-131313131313','22222222-2222-4222-8222-222222222222',
        'NSC-BOOK-01','Test Guest','pending','unpaid');
UPDATE public.bookings
SET status='confirmed', payment_status='payment_mismatch'
WHERE id='13131313-1313-4313-8313-131313131313';
UPDATE public.bookings SET payment_status='paid'
WHERE id='13131313-1313-4313-8313-131313131313';
UPDATE public.bookings
SET check_in='2026-11-20', adults=3, updated_at=now()
WHERE id='13131313-1313-4313-8313-131313131313';

-- Maintenance task creation, unassigned routing, overdue detection, assignment and resolution.
INSERT INTO public.ops_tasks(
  id,property_id,room_state_id,category,title,priority,status,due_at
) VALUES (
  '14141414-1414-4414-8414-141414141414',
  '22222222-2222-4222-8222-222222222222',
  '12121212-1212-4212-8212-121212121212',
  'maintenance','Repair air-conditioning',1,'pending',now()-interval '1 hour'
);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT public.staynas_escalate_operational_notifications();
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
UPDATE public.ops_tasks
SET assignee_id='55555555-5555-4555-8555-555555555555',status='in_progress',updated_at=now()
WHERE id='14141414-1414-4414-8414-141414141414';
UPDATE public.ops_tasks
SET status='completed',updated_at=now()
WHERE id='14141414-1414-4414-8414-141414141414';

-- Housekeeping exception report and resolution.
INSERT INTO public.housekeeping_exceptions(id,room_state_id,reported_by,assigned_to)
VALUES ('15151515-1515-4515-8515-151515151515',
        '12121212-1212-4212-8212-121212121212',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555');
SELECT public.housekeeping_record_event(
  'exception_reported',
  '12121212-1212-4212-8212-121212121212',
  NULL, NULL,
  '15151515-1515-4515-8515-151515151515',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555',
  jsonb_build_object('summary','Water leak reported'),
  '16161616-1616-4616-8616-161616161616'
);
SELECT public.housekeeping_record_event(
  'maintenance_escalated',
  '12121212-1212-4212-8212-121212121212',
  NULL, NULL,
  '15151515-1515-4515-8515-151515151515',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555',
  jsonb_build_object('summary','Maintenance escalation'),
  '17171717-1717-4717-8717-171717171717'
);
SELECT public.housekeeping_record_event(
  'exception_resolved',
  '12121212-1212-4212-8212-121212121212',
  NULL, NULL,
  '15151515-1515-4515-8515-151515151515',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555',
  jsonb_build_object('summary','Leak repaired'),
  '17171717-1717-4717-8717-171717171717'
);

-- Inspection workflow: inspector is a direct recipient; passed inspection resolves task alerts.
INSERT INTO public.ops_tasks(id,property_id,room_state_id,category,title,priority,status,assignee_id)
VALUES ('18181818-1818-4818-8818-181818181818',
        '22222222-2222-4222-8222-222222222222',
        '12121212-1212-4212-8212-121212121212',
        'housekeeping','Clean Room 01',2,'in_progress',
        '55555555-5555-4555-8555-555555555555');
INSERT INTO public.housekeeping_inspections(id,inspector_id)
VALUES ('19191919-1919-4919-8919-191919191919','44444444-4444-4444-8444-444444444444');
SELECT public.housekeeping_record_event('task_created','12121212-1212-4212-8212-121212121212',
  '18181818-1818-4818-8818-181818181818',NULL,NULL,'33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555','{}','20202020-2020-4020-8020-202020202020');
SELECT public.housekeeping_record_event('inspection_requested','12121212-1212-4212-8212-121212121212',
  '18181818-1818-4818-8818-181818181818','19191919-1919-4919-8919-191919191919',NULL,
  '33333333-3333-4333-8333-333333333333',NULL,'{}','21212121-2121-4121-8121-212121212121');
SELECT public.housekeeping_record_event('inspection_failed','12121212-1212-4212-8212-121212121212',
  '18181818-1818-4818-8818-181818181818','19191919-1919-4919-8919-191919191919',NULL,
  '33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555','{}','22222222-2222-4222-8222-222222222222');
SELECT public.housekeeping_record_event('inspection_passed','12121212-1212-4212-8212-121212121212',
  '18181818-1818-4818-8818-181818181818','19191919-1919-4919-8919-191919191919',NULL,
  '33333333-3333-4333-8333-333333333333',NULL,'{}','23232323-2323-4323-8323-232323232323');

-- Guest request: receive, overdue escalation, fulfilment and closure.
INSERT INTO public.staynas_guest_requests(
  id,property_id,category,priority,status,request_text,created_by,booking_id,requested_for
) VALUES (
  '24242424-2424-4424-8424-242424242424',
  '22222222-2222-4222-8222-222222222222',
  'maintenance',1,'received','Air-conditioning not cooling',
  '44444444-4444-4444-8444-444444444444',
  '13131313-1313-4313-8313-131313131313',now()-interval '1 hour'
);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT public.staynas_escalate_operational_notifications();
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
UPDATE public.staynas_guest_requests
SET status='fulfilled',status_updated_by='33333333-3333-4333-8333-333333333333',updated_at=now()
WHERE id='24242424-2424-4424-8424-242424242424';

-- Finance folio posting failure and successful posting.
INSERT INTO public.pms_folio_postings(
  id,booking_id,status,created_by,description,amount,currency,failure_code
) VALUES (
  '25252525-2525-4525-8525-252525252525',
  '13131313-1313-4313-8313-131313131313',
  'failed','66666666-6666-4666-8666-666666666666',
  'Restaurant room charge',125000,'TZS','POSTING_REJECTED'
);
UPDATE public.pms_folio_postings SET status='posted',updated_at=now()
WHERE id='25252525-2525-4525-8525-252525252525';

-- Room taken out of service and returned to service.
UPDATE public.room_states SET state='maintenance',updated_at=now()
WHERE id='12121212-1212-4212-8212-121212121212';
UPDATE public.room_states SET state='vacant_clean',updated_at=now()
WHERE id='12121212-1212-4212-8212-121212121212';

-- Approved LexiBite property connection: only this remote tenant/property may
-- produce StayNas inventory notifications for the mapped local property.
INSERT INTO public.staynas_product_connections(
  id,remote_product,remote_tenant_id,remote_property_id,
  local_organisation_id,local_property_id,status,local_approved_at,remote_approved_at,correlation_id
) VALUES (
  '30303030-3030-4030-8030-303030303030','lexibite',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'active',now(),now(),'nsc-lexibite-connection-01'
);

INSERT INTO public.restaurant_inventory_items(
  id,tenant_id,property_id,name,current_quantity,reorder_point,par_level,status
) VALUES (
  '33333333-3333-4333-8333-333333333330',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232',
  'Coffee beans',3,10,12,'active'
);
INSERT INTO public.restaurant_stock_movements(
  id,tenant_id,property_id,inventory_item_id,movement_type,quantity,balance_after,currency
) VALUES (
  '34343434-3434-4434-8434-343434343434',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232',
  '33333333-3333-4333-8333-333333333330','wastage',1,3,'TZS'
);
INSERT INTO public.restaurant_purchase_orders(id,tenant_id,property_id,reference,status)
VALUES ('35353535-3535-4535-8535-353535353535',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232','PO-NSC-01','submitted');
UPDATE public.restaurant_purchase_orders SET status='approved',updated_at=now()
WHERE id='35353535-3535-4535-8535-353535353535';
INSERT INTO public.restaurant_goods_receipts(id,tenant_id,property_id,document_number,status)
VALUES ('36363636-3636-4636-8636-363636363636',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232','GR-NSC-01','posted');
INSERT INTO public.restaurant_stocktakes(id,tenant_id,property_id,stocktake_number,status,variance_value)
VALUES ('37373737-3737-4737-8737-373737373737',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232','ST-NSC-01','posted',12500);
INSERT INTO public.restaurant_stock_transfers(id,tenant_id,property_id,transfer_number,status)
VALUES ('38383838-3838-4838-8838-383838383838',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232','TR-NSC-01','rejected');
INSERT INTO public.restaurant_reconciliation_exceptions(
  id,tenant_id,property_id,status,severity,title,what_happened,required_action,impact_value,dedupe_key
) VALUES (
  '39393939-3939-4939-8939-393939393939',
  '31313131-3131-4131-8131-313131313131','32323232-3232-4232-8232-323232323232',
  'open','critical','Inventory variance','Stock ledger mismatch','Review and reconcile',12500,'recon-nsc-01'
);
UPDATE public.restaurant_reconciliation_exceptions
SET status='resolved',resolution='adjusted',updated_at=now()
WHERE id='39393939-3939-4939-8939-393939393939';
UPDATE public.restaurant_inventory_items
SET current_quantity=20,updated_at=now()
WHERE id='33333333-3333-4333-8333-333333333330';

-- An unconnected remote property must never fan out to any StayNas property.
INSERT INTO public.restaurant_inventory_items(
  id,tenant_id,property_id,name,current_quantity,reorder_point,status
) VALUES (
  '40404040-4040-4040-8040-404040404040',
  '41414141-4141-4141-8141-414141414141','42424242-4242-4242-8242-424242424242',
  'Unconnected stock',1,10,'active'
);

-- Explicit source-event replay must not duplicate the event or recipient delivery.
DO $$
DECLARE v_event uuid; v_count integer;
BEGIN
  v_event := nsc_private.staynas_publish_operational_notification(
    '22222222-2222-4222-8222-222222222222','nsc.verification','nsc-e2e-dedupe-key',
    'nsc_dedupe_test','nsc.verification','verification',NULL,
    '33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333',NULL,
    ARRAY[]::public.app_role[],'info','Deduplication test','Replay test',NULL,'{"test":true}'::jsonb,NULL,now()
  );
  PERFORM nsc_private.staynas_publish_operational_notification(
    '22222222-2222-4222-8222-222222222222','nsc.verification','nsc-e2e-dedupe-key',
    'nsc_dedupe_test','nsc.verification','verification',NULL,
    '33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333',NULL,
    ARRAY[]::public.app_role[],'info','Deduplication test','Replay test',NULL,'{"test":true}'::jsonb,NULL,now()
  );
  SELECT count(*) INTO v_count FROM public.operational_notification_events
  WHERE id=v_event AND dedupe_key='nsc-e2e-dedupe-key';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Source event deduplication failed'; END IF;
  SELECT count(*) INTO v_count FROM public.operational_notification_deliveries
  WHERE event_id=v_event AND recipient_user_id='33333333-3333-4333-8333-333333333333' AND channel='in_app';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Recipient delivery deduplication failed'; END IF;
END $$;

-- Assert producer coverage and business-source resolution.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.operational_notification_events
  WHERE property_id='22222222-2222-4222-8222-222222222222'
    AND event_type IN ('booking_created','booking_confirmed','booking_payment_payment_mismatch','booking_payment_paid',
      'ops_task_unassigned','ops_task_overdue','ops_task_assigned','ops_task_status_in_progress',
      'exception_reported','maintenance_escalated','exception_resolved','inspection_requested','inspection_failed','inspection_passed',
      'guest_request_received','guest_request_overdue','guest_request_fulfilled',
      'folio_posting_failed','folio_posting_posted','room_state_maintenance');
  IF v_count < 18 THEN RAISE EXCEPTION 'Expected operational source events missing; found %', v_count; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.event_type='booking_created' AND d.recipient_user_id='77777777-7777-4777-8777-777777777777'
  ) THEN RAISE EXCEPTION 'Reservations recipient was not resolved'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.event_type='booking_payment_payment_mismatch' AND d.recipient_user_id='66666666-6666-4666-8666-666666666666'
  ) THEN RAISE EXCEPTION 'Finance recipient was not resolved'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.event_type='inspection_requested' AND d.recipient_user_id='44444444-4444-4444-8444-444444444444'
  ) THEN RAISE EXCEPTION 'Assigned inspector was not resolved'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.event_type='maintenance_escalated' AND d.recipient_user_id='55555555-5555-4555-8555-555555555555'
  ) THEN RAISE EXCEPTION 'Assigned maintenance / exception operator was not resolved'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.entity_type='booking' AND e.event_type='booking_payment_payment_mismatch' AND d.resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'Settled payment mismatch was not resolved'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.entity_type='ops_task' AND e.entity_id='14141414-1414-4414-8414-141414141414' AND d.resolved_at IS NULL AND e.event_type <> 'ops_task_status_completed'
  ) THEN RAISE EXCEPTION 'Completed maintenance task notifications were not resolved'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.entity_type='housekeeping_exception' AND e.entity_id='15151515-1515-4515-8515-151515151515' AND d.resolved_at IS NULL
      AND e.event_type='exception_reported'
  ) THEN RAISE EXCEPTION 'Resolved housekeeping exception notification remained open'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.entity_type='guest_request' AND e.entity_id='24242424-2424-4424-8424-242424242424'
      AND d.resolved_at IS NULL AND e.event_type IN ('guest_request_received','guest_request_overdue')
  ) THEN RAISE EXCEPTION 'Fulfilled guest request notifications remained open'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.entity_type='folio_posting' AND e.entity_id='25252525-2525-4525-8525-252525252525'
      AND d.resolved_at IS NULL AND e.event_type='folio_posting_failed'
  ) THEN RAISE EXCEPTION 'Successful folio posting did not resolve failure alert'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events e
    JOIN public.operational_notification_deliveries d ON d.event_id=e.id
    WHERE e.entity_type='room_state' AND e.entity_id='12121212-1212-4212-8212-121212121212'
      AND d.resolved_at IS NULL AND e.event_type='room_state_maintenance'
  ) THEN RAISE EXCEPTION 'Room return-to-service did not resolve out-of-service alert'; END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='booking_modified' AND entity_id='13131313-1313-4313-8313-131313131313') THEN
    RAISE EXCEPTION 'Reservation detail modification did not emit a staff event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_low_stock' AND entity_id='33333333-3333-4333-8333-333333333330') THEN
    RAISE EXCEPTION 'Connected LexiBite low-stock alert was not routed to StayNas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries d
    JOIN public.operational_notification_events e ON e.id=d.event_id
    WHERE e.property_id='22222222-2222-4222-8222-222222222222'
      AND e.event_type='inventory_low_stock'
      AND e.entity_id='33333333-3333-4333-8333-333333333330'
      AND d.resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'Replenished inventory did not resolve low-stock notifications'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_stock_movement_wastage') THEN
    RAISE EXCEPTION 'LexiBite stock wastage event was not routed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_purchase_order_approved') THEN
    RAISE EXCEPTION 'Purchase order approval event was not routed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_goods_receipt_posted') THEN
    RAISE EXCEPTION 'Goods receipt posting event was not routed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_stocktake_variance') THEN
    RAISE EXCEPTION 'Stocktake variance event was not routed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_transfer_rejected') THEN
    RAISE EXCEPTION 'Rejected stock transfer event was not routed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND event_type='inventory_reconciliation_exception_resolved') THEN
    RAISE EXCEPTION 'Inventory reconciliation resolution event was not routed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.operational_notification_events
    WHERE entity_id='40404040-4040-4040-8040-404040404040') THEN
    RAISE EXCEPTION 'Unconnected LexiBite property leaked into StayNas notifications';
  END IF;
END $$;

-- Read, acknowledgement and resolution are distinct recipient-owned transitions.
DO $$
DECLARE v_delivery uuid; v_row public.operational_notification_deliveries%ROWTYPE;
BEGIN
  SELECT d.id INTO v_delivery
  FROM public.operational_notification_deliveries d
  JOIN public.operational_notification_events e ON e.id=d.event_id
  WHERE e.event_type='booking_created'
    AND d.recipient_user_id='33333333-3333-4333-8333-333333333333'
  LIMIT 1;
  IF v_delivery IS NULL THEN RAISE EXCEPTION 'Manager booking delivery missing'; END IF;
  PERFORM public.staynas_operational_notification_transition(v_delivery,'read');
  PERFORM public.staynas_operational_notification_transition(v_delivery,'acknowledge');
  PERFORM public.staynas_operational_notification_transition(v_delivery,'resolve');
  SELECT * INTO v_row FROM public.operational_notification_deliveries WHERE id=v_delivery;
  IF v_row.read_at IS NULL OR v_row.acknowledged_at IS NULL OR v_row.resolved_at IS NULL THEN
    RAISE EXCEPTION 'Read / acknowledge / resolve state transition failed';
  END IF;
END $$;

-- Escalation must assign a supervisor delivery and persist the escalation audit.
DO $$
DECLARE v_event uuid; v_delivery uuid;
BEGIN
  v_event := nsc_private.staynas_publish_operational_notification(
    '22222222-2222-4222-8222-222222222222','nsc.verification','nsc-e2e-escalation-key',
    'nsc_escalation_test','nsc.verification','verification',NULL,
    '33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555',NULL,
    ARRAY[]::public.app_role[],'critical','Escalation test','Test alert',NULL,'{"test":true}'::jsonb,NULL,now()
  );
  SELECT id INTO v_delivery FROM public.operational_notification_deliveries
  WHERE event_id=v_event AND recipient_user_id='55555555-5555-4555-8555-555555555555';
  UPDATE public.operational_notification_deliveries
  SET created_at=now()-interval '1 hour'
  WHERE id=v_delivery;
  PERFORM public.staynas_escalate_operational_notifications();
  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries
    WHERE id=v_delivery AND escalation_level=1 AND escalated_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Unacknowledged alert did not escalate'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries
    WHERE event_id=v_event AND recipient_user_id='33333333-3333-4333-8333-333333333333'
  ) THEN RAISE EXCEPTION 'Supervisor did not receive escalated alert'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_audit
    WHERE event_id=v_event AND action='escalated'
  ) THEN RAISE EXCEPTION 'Escalation audit entry missing'; END IF;
END $$;

-- Cross-property access must be denied by RLS, not merely by UI filtering.
SELECT set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
SELECT nsc_private.staynas_publish_operational_notification(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','nsc.verification','nsc-other-property-event',
  'other_property_event','nsc.verification','verification',NULL,
  '88888888-8888-4888-8888-888888888888','88888888-8888-4888-8888-888888888888',NULL,
  ARRAY['manager']::public.app_role[],'info','Other property event','Isolation test',NULL,'{"test":true}'::jsonb,NULL,now()
);
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.operational_notification_events
    WHERE property_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) THEN RAISE EXCEPTION 'Cross-property event visibility detected'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries
    WHERE recipient_user_id='88888888-8888-4888-8888-888888888888'
  ) THEN RAISE EXCEPTION 'Cross-user delivery visibility detected'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries
    WHERE property_id='22222222-2222-4222-8222-222222222222'
      AND recipient_user_id='88888888-8888-4888-8888-888888888888'
  ) THEN RAISE EXCEPTION 'Cross-property recipient resolution detected'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
