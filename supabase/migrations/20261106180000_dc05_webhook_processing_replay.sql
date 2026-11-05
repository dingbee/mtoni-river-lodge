-- DC-05.05 — durable webhook processing, retry leases and exception replay.
-- ARTIFACT ONLY. Apply only in isolated PostgreSQL/Supabase CI after DC-04 ledger.
BEGIN;

ALTER TABLE public.staynas_distribution_webhook_inbox
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_started_at timestamptz,\n  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_code text;

ALTER TABLE public.staynas_distribution_webhook_inbox
  DROP CONSTRAINT IF EXISTS staynas_distribution_webhook_inbox_processing_status_check;
ALTER TABLE public.staynas_distribution_webhook_inbox
  ADD CONSTRAINT staynas_distribution_webhook_inbox_processing_status_check
  CHECK (processing_status IN (
    'received','processing','processed','retryable_failure',
    'permanent_failure','ignored','manual_reconciliation'
  ));

ALTER TABLE public.staynas_distribution_webhook_inbox
  DROP CONSTRAINT IF EXISTS staynas_distribution_webhook_inbox_check;
ALTER TABLE public.staynas_distribution_webhook_inbox
  ADD CONSTRAINT staynas_distribution_webhook_inbox_lease_check CHECK (
    (processing_status = 'processing' AND lease_token IS NOT NULL
      AND lease_owner IS NOT NULL AND lease_started_at IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (processing_status <> 'processing' AND lease_token IS NULL
      AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_expires_at IS NULL)
  ),
  ADD CONSTRAINT staynas_distribution_webhook_inbox_processed_at_check CHECK (
    (processing_status IN ('processed','ignored','permanent_failure','manual_reconciliation')
      AND processed_at IS NOT NULL)
    OR
    (processing_status IN ('received','processing','retryable_failure')
      AND processed_at IS NULL)
  );

CREATE TABLE IF NOT EXISTS public.staynas_distribution_webhook_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  worker_id text NOT NULL CHECK (length(trim(worker_id)) BETWEEN 1 AND 128),
  status text NOT NULL CHECK (status IN (
    'processed','retryable_failure','permanent_failure','ignored',
    'manual_reconciliation','lease_expired'
  )),
  reconciliation_code text,
  safe_summary text CHECK (safe_summary IS NULL OR length(safe_summary) <= 500),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbox_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_webhook_replay_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  operator_id text NOT NULL CHECK (length(trim(operator_id)) BETWEEN 1 AND 128),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 8 AND 500),
  prior_status text NOT NULL CHECK (prior_status IN ('manual_reconciliation','permanent_failure','ignored')),
  prior_reconciliation_code text,
  prior_attempt_count integer NOT NULL CHECK (prior_attempt_count >= 0),
  prior_max_attempts integer NOT NULL CHECK (prior_max_attempts BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staynas_distribution_webhook_replay_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_webhook_replay_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.staynas_distribution_webhook_replay_audit TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_webhook_replay_audit FROM service_role;

CREATE INDEX IF NOT EXISTS staynas_distribution_webhook_inbox_claim_idx
  ON public.staynas_distribution_webhook_inbox(next_attempt_at, received_at, id)
  WHERE processing_status IN ('received','retryable_failure','processing');
CREATE INDEX IF NOT EXISTS staynas_distribution_webhook_attempts_inbox_idx
  ON public.staynas_distribution_webhook_attempts(inbox_id, attempt_number DESC);

ALTER TABLE public.staynas_distribution_webhook_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_webhook_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.staynas_distribution_webhook_attempts TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_webhook_attempts FROM service_role;

CREATE OR REPLACE FUNCTION public.staynas_claim_distribution_webhook(
  _worker_id text,
  _lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.staynas_distribution_webhook_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_webhook_inbox%ROWTYPE;
  _token uuid;
BEGIN
  IF _worker_id IS NULL OR length(pg_catalog.btrim(_worker_id)) NOT BETWEEN 1 AND 128
    OR _lease_seconds IS NULL OR _lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid webhook worker lease.' USING ERRCODE = '22023';
  END IF;

  -- Expired leases become immutable attempt evidence before a new claim.
  INSERT INTO public.staynas_distribution_webhook_attempts(
    inbox_id,attempt_number,worker_id,status,safe_summary,correlation_id,started_at,finished_at
  )
  SELECT i.id,i.attempt_count,coalesce(i.lease_owner,'unknown'),'lease_expired',
    'Webhook worker lease expired before completion.',i.correlation_id,
    coalesce(i.lease_started_at,i.received_at),pg_catalog.now()
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.processing_status='processing' AND i.lease_expires_at < pg_catalog.now()
    AND i.attempt_count > 0
  ON CONFLICT (inbox_id,attempt_number) DO NOTHING;

  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='permanent_failure', processed_at=pg_catalog.now(),
      lease_started_at=NULL,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      safe_error_summary='Webhook worker lease expired after retry budget was exhausted.'
  WHERE i.processing_status='processing' AND i.lease_expires_at < pg_catalog.now()
    AND i.attempt_count >= i.max_attempts;

  SELECT i.* INTO _row
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.attempt_count < i.max_attempts AND (
    (i.processing_status IN ('received','retryable_failure') AND i.next_attempt_at <= pg_catalog.now())
    OR (i.processing_status='processing' AND i.lease_expires_at < pg_catalog.now())
  )
  ORDER BY i.next_attempt_at,i.received_at,i.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF _row.id IS NULL THEN RETURN; END IF;

  _token := pg_catalog.gen_random_uuid();
  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='processing',attempt_count=i.attempt_count+1,
      lease_started_at=pg_catalog.now(),lease_token=_token,lease_owner=_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>_lease_seconds),
      safe_error_summary=NULL
  WHERE i.id=_row.id
  RETURNING i.* INTO _row;

  RETURN NEXT _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_finish_distribution_webhook(
  _inbox_id uuid,
  _lease_token uuid,
  _worker_id text,
  _status text,
  _safe_summary text DEFAULT NULL,
  _reconciliation_code text DEFAULT NULL,
  _retry_after_seconds integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_webhook_inbox%ROWTYPE;
BEGIN
  SELECT i.* INTO _row
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id AND i.processing_status='processing'
    AND i.lease_token=_lease_token AND i.lease_owner=_worker_id
    AND i.lease_expires_at > pg_catalog.now()
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Webhook processing lease is not current.' USING ERRCODE = '42501';
  END IF;

  IF _status NOT IN ('processed','retryable_failure','permanent_failure','ignored','manual_reconciliation')
    OR (_status='retryable_failure' AND (_retry_after_seconds IS NULL OR _retry_after_seconds NOT BETWEEN 1 AND 86400))
    OR (_status<>'retryable_failure' AND _retry_after_seconds IS NOT NULL)
    OR (_status IN ('permanent_failure','manual_reconciliation') AND
        (_reconciliation_code IS NULL OR length(pg_catalog.btrim(_reconciliation_code)) NOT BETWEEN 1 AND 96))
    OR (_status NOT IN ('permanent_failure','manual_reconciliation') AND _reconciliation_code IS NOT NULL)
    OR (_status<>'processed' AND (_safe_summary IS NULL OR length(_safe_summary)>500))
    OR (_status='processed' AND _safe_summary IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Invalid webhook processing result.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_attempts(
    inbox_id,attempt_number,worker_id,status,reconciliation_code,
    safe_summary,correlation_id,started_at,finished_at
  ) VALUES (
    _row.id,_row.attempt_count,_worker_id,_status,_reconciliation_code,
    _safe_summary,_row.correlation_id,
    _row.lease_started_at,pg_catalog.now()
  );

  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status=CASE
        WHEN _status='retryable_failure' AND i.attempt_count>=i.max_attempts
          THEN 'permanent_failure'
        ELSE _status END,
      next_attempt_at=CASE WHEN _status='retryable_failure' AND i.attempt_count<i.max_attempts
        THEN pg_catalog.now()+pg_catalog.make_interval(secs=>_retry_after_seconds)
        ELSE i.next_attempt_at END,
      processed_at=CASE WHEN _status IN ('processed','ignored','permanent_failure','manual_reconciliation')
        OR (_status='retryable_failure' AND i.attempt_count>=i.max_attempts)
        THEN pg_catalog.now() ELSE NULL END,
      reconciliation_code=coalesce(_reconciliation_code,
        CASE WHEN _status='retryable_failure' AND i.attempt_count>=i.max_attempts
          THEN 'retry_budget_exhausted' ELSE NULL END),
      safe_error_summary=_safe_summary,
      lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL
  WHERE i.id=_row.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_requeue_distribution_webhook(
  _inbox_id uuid,
  _operator_id text,
  _reason text,
  _additional_attempts integer DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_webhook_inbox%ROWTYPE;
BEGIN
  IF _operator_id IS NULL OR length(pg_catalog.btrim(_operator_id)) NOT BETWEEN 1 AND 128
    OR _reason IS NULL OR length(pg_catalog.btrim(_reason)) NOT BETWEEN 8 AND 500
    OR _additional_attempts IS NULL OR _additional_attempts NOT BETWEEN 1 AND 10\n    OR _reason ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'\n    OR _reason ~ '\\+?[0-9]{10,15}' OR _reason ~* 'bearer[[:space:]]+' THEN
    RAISE EXCEPTION 'Manual webhook replay requires operator, reason and bounded retry budget.'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.* INTO _row FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id FOR UPDATE;
  IF _row.id IS NULL OR _row.processing_status NOT IN
    ('manual_reconciliation','permanent_failure','ignored') THEN
    RAISE EXCEPTION 'Only terminal exception events may be manually requeued.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_replay_audit(
    inbox_id,operator_id,reason,prior_status,prior_reconciliation_code,
    prior_attempt_count,prior_max_attempts
  ) VALUES (
    _row.id,pg_catalog.btrim(_operator_id),pg_catalog.btrim(_reason),
    _row.processing_status,_row.reconciliation_code,_row.attempt_count,_row.max_attempts
  );

  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='received',processed_at=NULL,
      max_attempts=least(i.max_attempts+_additional_attempts,40),
      next_attempt_at=pg_catalog.now(),lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      reconciliation_code=NULL,
      safe_error_summary=NULL
  WHERE i.id=_inbox_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_claim_distribution_webhook(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_finish_distribution_webhook(uuid,uuid,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_requeue_distribution_webhook(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_claim_distribution_webhook(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_finish_distribution_webhook(uuid,uuid,text,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_requeue_distribution_webhook(uuid,text,text,integer) TO service_role;

COMMENT ON TABLE public.staynas_distribution_webhook_attempts IS
  'Append-only, PII-minimized processing evidence for DC-05 webhook inbox events.';
COMMENT ON FUNCTION public.staynas_requeue_distribution_webhook(uuid,text,text,integer) IS
  'Explicit service-only replay of terminal exception events; preserves original event identity and dedupe key.';

COMMIT;
