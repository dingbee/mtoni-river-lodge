-- DC-05.06 hardening: duplicate provider references resolve to a durable duplicate result.
BEGIN;
CREATE OR REPLACE FUNCTION public.staynas_record_distribution_financial_evidence(
  _inbox_id uuid,_lease_token uuid,_worker_id text,_payload_fingerprint text,
  _external_reservation_id text,_event_type text,_provider_event_id text,
  _evidence jsonb,_evidence_fingerprint text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_link public.staynas_distribution_reservation_links%ROWTYPE;
  v_id uuid; v_status text; v_code text; v_reference text; v_duplicate_code text;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role' THEN
    RAISE EXCEPTION 'Provider finance evidence is service-only.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_inbox FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id AND i.processing_status='processing'
    AND i.lease_token=_lease_token AND i.lease_owner=_worker_id
    AND i.lease_expires_at>pg_catalog.now()
  FOR UPDATE;
  IF v_inbox.id IS NULL THEN RAISE EXCEPTION 'Finance webhook lease is not current.' USING ERRCODE='42501'; END IF;
  IF _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR _provider_event_id IS DISTINCT FROM v_inbox.provider_event_id
     OR _event_type IS DISTINCT FROM v_inbox.event_type
     OR _external_reservation_id IS DISTINCT FROM v_inbox.normalized_event->>'externalReservationId'
     OR NOT EXISTS(SELECT 1 FROM public.staynas_distribution_reservation_payloads p
        WHERE p.inbox_id=v_inbox.id AND p.payload_fingerprint=_payload_fingerprint)
     OR _evidence IS NULL OR jsonb_typeof(_evidence)<>'object'
     OR _evidence_fingerprint IS NULL OR _evidence_fingerprint !~ '^[0-9a-f]{64}$'
     OR _event_type NOT IN ('reservation.payment_updated','reservation.refund_notified',
       'reservation.refund_reversed','reservation.settlement_reported','reservation.settlement_adjusted') THEN
    RAISE EXCEPTION 'Provider financial evidence does not match its verified inbox event.' USING ERRCODE='22023';
  END IF;

  -- Only allow the explicitly modeled financial fields; guest/PII and raw payloads never enter this table.
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(_evidence) k
    WHERE k NOT IN ('originalCurrency','paymentAmount','paymentCurrency','paymentStatus','paymentReference',
      'settlementReference','settlementAmount','settlementCurrency','settlementAt','settlementDueAt',
      'exchangeRate','settlementAdjustmentType','refundAmount','refundCurrency','refundReference',
      'refundAt','refundReversalAmount','refundReversalReference','grossAmount','taxes','fees',
      'channelCommission','expectedSettlement')) THEN
    RAISE EXCEPTION 'Unexpected fields in financial evidence.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_link FROM public.staynas_distribution_reservation_links l
  WHERE l.organisation_id=v_inbox.organisation_id AND l.property_id=v_inbox.property_id
    AND l.connection_id=v_inbox.connection_id AND l.account_grant_id=v_inbox.account_grant_id
    AND l.external_account_id=v_inbox.external_account_id AND l.provider_key=v_inbox.provider_key
    AND l.environment=v_inbox.environment AND l.external_reservation_id=_external_reservation_id
  FOR UPDATE;

  v_status:=CASE WHEN v_link.id IS NULL THEN 'unmatched' ELSE 'review_required' END;
  v_code:=CASE WHEN v_link.id IS NULL THEN 'canonical_reservation_link_missing'
    ELSE 'provider_financial_evidence_requires_finance_review' END;
  v_reference:=coalesce(_evidence->>'settlementReference',_evidence->>'refundReference',
    _evidence->>'refundReversalReference',_evidence->>'paymentReference');
  v_duplicate_code:='provider_event_already_recorded';
  INSERT INTO public.staynas_distribution_financial_evidence(
    organisation_id,property_id,connection_id,account_grant_id,external_account_id,
    provider_key,environment,external_reservation_id,booking_id,source_inbox_id,
    provider_event_id,event_type,provider_reference,evidence,evidence_fingerprint,
    reconciliation_status,reconciliation_code
  ) VALUES (
    v_inbox.organisation_id,v_inbox.property_id,v_inbox.connection_id,v_inbox.account_grant_id,
    v_inbox.external_account_id,v_inbox.provider_key,v_inbox.environment,_external_reservation_id,
    v_link.booking_id,v_inbox.id,_provider_event_id,_event_type,v_reference,_evidence,
    _evidence_fingerprint,v_status,v_code
  ) ON CONFLICT(provider_key,external_account_id,provider_event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.staynas_distribution_financial_evidence
    WHERE provider_key=v_inbox.provider_key AND external_account_id=v_inbox.external_account_id
      AND provider_event_id=_provider_event_id;
    v_status:='duplicate_reference'; v_code:='provider_event_already_recorded';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_attempts(
    inbox_id,attempt_number,worker_id,status,reconciliation_code,safe_summary,
    correlation_id,started_at,finished_at
  ) VALUES(v_inbox.id,v_inbox.attempt_count,_worker_id,
    CASE WHEN v_status='unmatched' THEN 'manual_reconciliation' ELSE 'processed' END,
    CASE WHEN v_status='unmatched' THEN v_code ELSE NULL END,
    CASE WHEN v_status='unmatched' THEN 'Provider financial evidence has no canonical reservation link.' ELSE NULL END,
    v_inbox.correlation_id,coalesce(v_inbox.lease_started_at,v_inbox.received_at),pg_catalog.now())
  ON CONFLICT(inbox_id,attempt_number) DO NOTHING;

  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status=CASE WHEN v_status='unmatched' THEN 'manual_reconciliation' ELSE 'processed' END,
      processed_at=pg_catalog.now(),reconciliation_code=CASE WHEN v_status='unmatched' THEN v_code ELSE NULL END,
      safe_error_summary=CASE WHEN v_status='unmatched' THEN 'Provider financial evidence requires reservation matching.' ELSE NULL END,
      lease_started_at=NULL,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL
  WHERE i.id=v_inbox.id;
  RETURN jsonb_build_object('evidence_id',v_id,'status',v_status,'reconciliation_code',v_code,
    'booking_id',v_link.booking_id,'posted_to_finance',false);
END;
$function$;
COMMIT;
