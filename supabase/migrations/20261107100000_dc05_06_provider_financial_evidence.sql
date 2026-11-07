-- DC-05.06 — durable provider finance evidence and reconciliation.
-- Provider notifications are evidence only; this migration never posts cash movements.
BEGIN;

DO $deps$
BEGIN
  IF to_regclass('public.staynas_distribution_webhook_inbox') IS NULL
     OR to_regclass('public.staynas_distribution_reservation_links') IS NULL
     OR to_regclass('public.staynas_distribution_reservation_payloads') IS NULL
     OR to_regclass('public.staynas_distribution_webhook_attempts') IS NULL THEN
    RAISE EXCEPTION 'DC-05.06 requires the DC-05 webhook and reservation foundation.';
  END IF;
END
$deps$;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_financial_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid,
  account_grant_id uuid NOT NULL,
  external_account_id uuid NOT NULL,
  provider_key text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  external_reservation_id text NOT NULL,
  booking_id uuid,
  source_inbox_id uuid NOT NULL REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  provider_event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'reservation.payment_updated','reservation.refund_notified',
    'reservation.refund_reversed','reservation.settlement_reported',
    'reservation.settlement_adjusted'
  )),
  provider_reference text,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
  evidence_fingerprint text NOT NULL CHECK (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  reconciliation_status text NOT NULL CHECK (reconciliation_status IN (
    'unmatched','evidence_received','review_required','duplicate_reference'
  )),
  reconciliation_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_key,external_account_id,provider_event_id),
  CHECK (reconciliation_code IS NULL OR length(reconciliation_code) BETWEEN 1 AND 96),
  CHECK (booking_id IS NULL OR reconciliation_status <> 'unmatched')
);

CREATE UNIQUE INDEX IF NOT EXISTS staynas_distribution_financial_evidence_reference_uidx
  ON public.staynas_distribution_financial_evidence(provider_key,external_account_id,event_type,provider_reference)
  WHERE provider_reference IS NOT NULL AND length(provider_reference)>0;
CREATE INDEX IF NOT EXISTS staynas_distribution_financial_evidence_booking_idx
  ON public.staynas_distribution_financial_evidence(property_id,booking_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_financial_evidence_review_idx
  ON public.staynas_distribution_financial_evidence(property_id,reconciliation_status,received_at DESC);

ALTER TABLE public.staynas_distribution_financial_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_financial_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.staynas_distribution_financial_evidence TO service_role;
REVOKE UPDATE,DELETE,TRUNCATE ON public.staynas_distribution_financial_evidence FROM service_role;

CREATE OR REPLACE FUNCTION public.staynas_claim_distribution_finance_webhook(
  _worker_id text,
  _lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.staynas_distribution_webhook_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_row public.staynas_distribution_webhook_inbox%ROWTYPE; v_token uuid;
BEGIN
  IF _worker_id IS NULL OR length(pg_catalog.btrim(_worker_id)) NOT BETWEEN 1 AND 128
     OR _lease_seconds IS NULL OR _lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid finance worker lease.' USING ERRCODE='22023';
  END IF;
  SELECT i.* INTO v_row
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.event_type IN ('reservation.payment_updated','reservation.refund_notified',
      'reservation.refund_reversed','reservation.settlement_reported','reservation.settlement_adjusted')
    AND EXISTS(SELECT 1 FROM public.staynas_distribution_reservation_payloads p WHERE p.inbox_id=i.id)
    AND i.attempt_count<i.max_attempts
    AND ((i.processing_status IN ('received','retryable_failure') AND i.next_attempt_at<=pg_catalog.now())
      OR (i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now()))
  ORDER BY i.next_attempt_at,i.received_at,i.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.processing_status='processing' THEN
    INSERT INTO public.staynas_distribution_webhook_attempts(
      inbox_id,attempt_number,worker_id,status,safe_summary,correlation_id,started_at,finished_at
    ) VALUES(v_row.id,v_row.attempt_count,coalesce(v_row.lease_owner,'unknown'),'lease_expired',
      'Provider finance worker lease expired.',v_row.correlation_id,
      coalesce(v_row.lease_started_at,v_row.received_at),pg_catalog.now())
    ON CONFLICT(inbox_id,attempt_number) DO NOTHING;
  END IF;
  v_token:=pg_catalog.gen_random_uuid();
  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='processing',attempt_count=i.attempt_count+1,
      lease_started_at=pg_catalog.now(),lease_token=v_token,lease_owner=_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>_lease_seconds),
      safe_error_summary=NULL
  WHERE i.id=v_row.id RETURNING i.* INTO v_row;
  RETURN NEXT v_row;
END;
$function$;

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
  v_id uuid; v_status text; v_code text; v_reference text;
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

REVOKE ALL ON FUNCTION public.staynas_claim_distribution_finance_webhook(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_record_distribution_financial_evidence(uuid,uuid,text,text,text,text,text,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_claim_distribution_finance_webhook(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_record_distribution_financial_evidence(uuid,uuid,text,text,text,text,text,jsonb,text)
  TO service_role;

COMMIT;
