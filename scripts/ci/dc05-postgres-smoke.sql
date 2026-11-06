-- DC-05.05 database-level retry, lease, replay and authorization checks.
\set ON_ERROR_STOP on

DO $privileges$
BEGIN
  IF has_table_privilege('anon','public.staynas_distribution_webhook_attempts','SELECT')
     OR has_table_privilege('authenticated','public.staynas_distribution_webhook_attempts','SELECT')
     OR has_table_privilege('anon','public.staynas_distribution_webhook_replay_audit','SELECT')
     OR has_table_privilege('authenticated','public.staynas_distribution_webhook_replay_audit','SELECT') THEN
    RAISE EXCEPTION 'Webhook attempt/replay audit tables are exposed to browser roles';
  END IF;
  IF has_function_privilege('anon','public.staynas_claim_distribution_webhook(text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.staynas_claim_distribution_webhook(text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_claim_distribution_webhook(text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Webhook claim RPC grants are not server-only';
  END IF;
END
$privileges$;

SET ROLE service_role;
DO $dc05$
DECLARE
  v_claim public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_reclaimed public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_event_id text;
  v_audit_count integer;
  v_max_attempts integer;
  v_retry public.staynas_distribution_webhook_inbox%ROWTYPE;
BEGIN
  -- DC-04 smoke has already inserted one durable inbox event.
  SELECT * INTO v_claim
  FROM public.staynas_claim_distribution_webhook('dc05-ci-worker-a',30)
  LIMIT 1;
  IF v_claim.id IS NULL OR v_claim.processing_status <> 'processing'
     OR v_claim.lease_token IS NULL OR v_claim.attempt_count <> 1 THEN
    RAISE EXCEPTION 'Initial webhook claim failed';
  END IF;
  v_event_id := v_claim.provider_event_id;

  -- A stale worker cannot complete after lease expiry.
  UPDATE public.staynas_distribution_webhook_inbox
  SET lease_expires_at=pg_catalog.now()-interval '1 second'
  WHERE id=v_claim.id;
  BEGIN
    PERFORM public.staynas_finish_distribution_webhook(
      v_claim.id,v_claim.lease_token,'dc05-ci-worker-a','processed',NULL,NULL,NULL
    );
    RAISE EXCEPTION 'Expired webhook lease unexpectedly completed';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  SELECT * INTO v_reclaimed
  FROM public.staynas_claim_distribution_webhook('dc05-ci-worker-b',30)
  LIMIT 1;
  IF v_reclaimed.id IS DISTINCT FROM v_claim.id OR v_reclaimed.attempt_count <> 2
     OR v_reclaimed.lease_token IS NULL THEN
    RAISE EXCEPTION 'Expired webhook lease was not safely reclaimed';
  END IF;
  IF (SELECT count(*) FROM public.staynas_distribution_webhook_attempts
      WHERE inbox_id=v_claim.id AND attempt_number=1 AND status='lease_expired') <> 1 THEN
    RAISE EXCEPTION 'Expired webhook attempt evidence is missing';
  END IF;

  -- Finish as manual reconciliation, then requeue the same event with audit evidence.
  PERFORM public.staynas_finish_distribution_webhook(
    v_reclaimed.id,v_reclaimed.lease_token,'dc05-ci-worker-b',
    'manual_reconciliation','Room mapping requires operator review.','room_mapping_missing',NULL
  );
  PERFORM public.staynas_requeue_distribution_webhook(
    v_claim.id,'ci-operator','Replay after correcting the room mapping.',3
  );

  IF (SELECT processing_status FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) <> 'received'
     OR (SELECT provider_event_id FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) <> v_event_id
     OR (SELECT max_attempts FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) <> 8 THEN
    RAISE EXCEPTION 'Manual replay did not preserve event identity or extend retry budget';
  END IF;
  SELECT count(*) INTO v_audit_count
  FROM public.staynas_distribution_webhook_replay_audit
  WHERE inbox_id=v_claim.id AND prior_status='manual_reconciliation'
    AND prior_reconciliation_code='room_mapping_missing';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'Manual replay audit evidence missing';
  END IF;

  SELECT * INTO v_reclaimed
  FROM public.staynas_claim_distribution_webhook('dc05-ci-worker-c',30)
  LIMIT 1;
  IF v_reclaimed.id IS DISTINCT FROM v_claim.id OR v_reclaimed.attempt_count <> 3 THEN
    RAISE EXCEPTION 'Requeued event was not claimable';
  END IF;
  PERFORM public.staynas_finish_distribution_webhook(
    v_reclaimed.id,v_reclaimed.lease_token,'dc05-ci-worker-c','processed',NULL,NULL,NULL
  );
  IF (SELECT processing_status FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) <> 'processed'
     OR (SELECT lease_started_at FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) IS NOT NULL THEN
    RAISE EXCEPTION 'Webhook completion did not clear processing lease';
  END IF;

  -- Exhausted automatic retry budget becomes a terminal, auditable exception.
  SELECT inbox_id INTO v_claim.id
  FROM public.staynas_receive_distribution_webhook(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'test_provider','sandbox','provider-event-dc05-budget','reservation.modified',
    repeat('e',64),'{"event":"retry-budget"}'::jsonb,'dc05-budget-correlation'
  );
  UPDATE public.staynas_distribution_webhook_inbox
  SET max_attempts=1
  WHERE id=v_claim.id;
  SELECT * INTO v_retry
  FROM public.staynas_claim_distribution_webhook('dc05-ci-budget-worker',30)
  LIMIT 1;
  IF v_retry.id IS DISTINCT FROM v_claim.id THEN
    RAISE EXCEPTION 'Retry-budget event was not claimed';
  END IF;
  PERFORM public.staynas_finish_distribution_webhook(
    v_retry.id,v_retry.lease_token,'dc05-ci-budget-worker',
    'retryable_failure','Provider temporarily unavailable.',NULL,30
  );
  IF (SELECT processing_status FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) <> 'permanent_failure'
     OR (SELECT reconciliation_code FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) <> 'retry_budget_exhausted'
     OR (SELECT processed_at FROM public.staynas_distribution_webhook_inbox WHERE id=v_claim.id) IS NULL THEN
    RAISE EXCEPTION 'Exhausted retry budget did not become a terminal exception';
  END IF;
END
$dc05$;
RESET ROLE;

SELECT 'DC-05.05 webhook lease, retry, replay and authorization tests passed' AS result;
