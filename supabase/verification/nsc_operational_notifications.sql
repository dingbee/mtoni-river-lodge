-- NSC-05 UAT verification. Run only against a non-production database with
-- at least one active StayNas property membership. All mutations are rolled back.
BEGIN;

DO $$
DECLARE
  v_property_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_delivery_id uuid;
  v_key text := 'nsc-verification:' || gen_random_uuid()::text;
  v_count integer;
  v_row public.operational_notification_deliveries%ROWTYPE;
BEGIN
  SELECT pm.property_id, pm.user_id
    INTO v_property_id, v_user_id
  FROM public.staynas_property_members pm
  JOIN public.staynas_properties p ON p.id = pm.property_id
  WHERE pm.status = 'active' AND p.status = 'active' AND pm.role <> 'user'::public.app_role
  ORDER BY pm.created_at, pm.user_id
  LIMIT 1;

  IF v_property_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'NSC verification requires an active property membership fixture';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  v_event_id := nsc_private.staynas_publish_operational_notification(
    v_property_id, 'nsc.verification', v_key, 'nsc_test_event',
    'nsc.verification', 'verification', NULL, v_user_id, v_user_id, NULL,
    ARRAY[]::public.app_role[], 'critical', 'NSC verification event',
    'Temporary verification event; transaction will roll back.',
    NULL, jsonb_build_object('test', true), NULL, now()
  );

  SELECT count(*) INTO v_count
  FROM public.operational_notification_events
  WHERE id = v_event_id AND property_id = v_property_id AND dedupe_key = v_key;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Event persistence/property binding failed'; END IF;

  SELECT id INTO v_delivery_id
  FROM public.operational_notification_deliveries
  WHERE event_id = v_event_id AND recipient_user_id = v_user_id AND property_id = v_property_id;

  IF v_delivery_id IS NULL THEN RAISE EXCEPTION 'Recipient delivery was not created'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_notification_deliveries WHERE id = v_delivery_id AND assigned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Recipient assignment timestamp was not persisted';
  END IF;

  PERFORM nsc_private.staynas_publish_operational_notification(
    v_property_id, 'nsc.verification', v_key, 'nsc_test_event',
    'nsc.verification', 'verification', NULL, v_user_id, v_user_id, NULL,
    ARRAY[]::public.app_role[], 'critical', 'NSC verification event',
    'Duplicate event replay.', NULL, jsonb_build_object('test', true), NULL, now()
  );

  SELECT count(*) INTO v_count
  FROM public.operational_notification_events
  WHERE property_id = v_property_id AND dedupe_key = v_key;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Event deduplication failed'; END IF;

  SELECT count(*) INTO v_count
  FROM public.operational_notification_deliveries
  WHERE event_id = v_event_id AND recipient_user_id = v_user_id AND channel = 'in_app';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Recipient/channel deduplication failed'; END IF;

  PERFORM public.staynas_operational_notification_transition(v_delivery_id, 'read');
  PERFORM public.staynas_operational_notification_transition(v_delivery_id, 'acknowledge');
  PERFORM public.staynas_operational_notification_transition(v_delivery_id, 'resolve');

  SELECT * INTO v_row
  FROM public.operational_notification_deliveries
  WHERE id = v_delivery_id;

  IF v_row.read_at IS NULL OR v_row.acknowledged_at IS NULL OR v_row.resolved_at IS NULL THEN
    RAISE EXCEPTION 'Read, acknowledgement and resolution lifecycle did not persist independently';
  END IF;

  -- A separate unacknowledged critical delivery must escalate to active
  -- supervisors from this same property, without crossing property boundaries.
  v_key := v_key || ':escalation';
  v_event_id := nsc_private.staynas_publish_operational_notification(
    v_property_id, 'nsc.verification', v_key, 'nsc_test_escalation',
    'nsc.verification', 'verification', NULL, v_user_id, v_user_id, NULL,
    ARRAY[]::public.app_role[], 'critical', 'NSC escalation verification',
    'Temporary escalation event; transaction will roll back.',
    NULL, jsonb_build_object('test', true), NULL, now() - interval '1 hour'
  );

  UPDATE public.operational_notification_deliveries
  SET created_at = now() - interval '1 hour'
  WHERE event_id = v_event_id AND recipient_user_id = v_user_id;

  PERFORM public.staynas_escalate_operational_notifications();

  IF NOT EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries
    WHERE event_id = v_event_id AND recipient_user_id = v_user_id
      AND escalation_level = 1 AND escalated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Critical notification escalation was not recorded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.operational_notification_deliveries d
    WHERE d.event_id = v_event_id AND d.property_id <> v_property_id
  ) THEN
    RAISE EXCEPTION 'Cross-property recipient delivery detected';
  END IF;

  RAISE NOTICE 'NSC verification passed: persistence, property binding, idempotency, acknowledgement, resolution and escalation';
END $$;

ROLLBACK;
