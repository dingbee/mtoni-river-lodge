-- DC-04.8 — durable distribution operation, inbox and outbox ledger.
-- ARTIFACT ONLY: apply first in isolated PostgreSQL/Supabase CI; never shared production.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_operation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  provider_key text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  operation text NOT NULL CHECK (length(trim(operation)) BETWEEN 1 AND 96),
  capability text NOT NULL CHECK (capability IN (
    'listing.read','listing.write','room_mapping.read','room_mapping.write',
    'rate_plan.read','rate_plan.write','availability.read','availability.write',
    'reservation.read','reservation.import','reservation.update','reservation.cancel',
    'connection.health'
  )),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 128),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_payload) = 'object'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','running','retryable_failure','succeeded','permanent_failure','cancelled'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  provider_reference text,
  result_reference text,
  normalized_error_code text CHECK (normalized_error_code IS NULL OR normalized_error_code IN (
    'authentication','authorization','configuration','unsupported_capability',
    'rate_limited','timeout','provider_unavailable','invalid_request','conflict',
    'not_found','permanent_provider_error','unknown'
  )),
  safe_error_summary text CHECK (safe_error_summary IS NULL OR length(safe_error_summary) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (id, organisation_id, property_id),
  UNIQUE (property_id, connection_id, operation, idempotency_key),
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'running' AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (
    (status IN ('succeeded','permanent_failure','cancelled') AND completed_at IS NOT NULL)
    OR
    (status IN ('queued','running','retryable_failure') AND completed_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_operation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  worker_id text NOT NULL CHECK (length(trim(worker_id)) BETWEEN 1 AND 128),
  status text NOT NULL CHECK (status IN ('succeeded','retryable_failure','permanent_failure','lease_expired')),
  normalized_error_code text CHECK (normalized_error_code IS NULL OR normalized_error_code IN (
    'authentication','authorization','configuration','unsupported_capability',
    'rate_limited','timeout','provider_unavailable','invalid_request','conflict',
    'not_found','permanent_provider_error','unknown'
  )),
  safe_summary text CHECK (safe_summary IS NULL OR length(safe_summary) <= 500),
  provider_request_reference text,
  response_code integer CHECK (response_code IS NULL OR response_code BETWEEN 100 AND 599),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, attempt_number),
  FOREIGN KEY (operation_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_operation_ledger(id, organisation_id, property_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  account_grant_id uuid NOT NULL,
  external_account_id uuid NOT NULL,
  provider_key text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  provider_event_id text NOT NULL CHECK (length(trim(provider_event_id)) BETWEEN 1 AND 256),
  event_type text NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 96),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  normalized_event jsonb NOT NULL CHECK (jsonb_typeof(normalized_event) = 'object'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN (
    'received','processing','processed','retryable_failure','permanent_failure','ignored'
  )),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  safe_error_summary text CHECK (safe_error_summary IS NULL OR length(safe_error_summary) <= 500),
  UNIQUE (provider_key, external_account_id, provider_event_id),
  FOREIGN KEY (account_grant_id, organisation_id, property_id, external_account_id, provider_key, environment)
    REFERENCES public.staynas_distribution_account_grants
      (id, organisation_id, property_id, external_account_id, provider_key, environment)
    ON DELETE RESTRICT,
  CHECK (
    (processing_status IN ('processed','ignored','permanent_failure') AND processed_at IS NOT NULL)
    OR
    (processing_status IN ('received','processing','retryable_failure') AND processed_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  operation_id uuid,
  event_key text NOT NULL CHECK (length(trim(event_key)) BETWEEN 8 AND 160),
  event_type text NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 96),
  event_payload jsonb NOT NULL CHECK (jsonb_typeof(event_payload) = 'object'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','publishing','published','retryable_failure','permanent_failure'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  published_at timestamptz,
  safe_error_summary text CHECK (safe_error_summary IS NULL OR length(safe_error_summary) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, event_key),
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (operation_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_operation_ledger(id, organisation_id, property_id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'publishing' AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'publishing' AND lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK ((status = 'published' AND published_at IS NOT NULL) OR status <> 'published')
);

CREATE INDEX IF NOT EXISTS staynas_distribution_operations_due_idx
  ON public.staynas_distribution_operation_ledger(status, next_attempt_at, created_at)
  WHERE status IN ('queued','retryable_failure');
CREATE INDEX IF NOT EXISTS staynas_distribution_operations_property_idx
  ON public.staynas_distribution_operation_ledger(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_attempts_operation_idx
  ON public.staynas_distribution_operation_attempts(operation_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_webhook_inbox_due_idx
  ON public.staynas_distribution_webhook_inbox(processing_status, received_at)
  WHERE processing_status IN ('received','retryable_failure');
CREATE INDEX IF NOT EXISTS staynas_distribution_outbox_due_idx
  ON public.staynas_distribution_outbox(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retryable_failure');

ALTER TABLE public.staynas_distribution_operation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_operation_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_operation_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_webhook_inbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_operation_ledger TO service_role;
GRANT SELECT, INSERT ON public.staynas_distribution_operation_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_webhook_inbox TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_outbox TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON public.staynas_distribution_operation_attempts FROM service_role;

CREATE OR REPLACE FUNCTION public.staynas_enqueue_distribution_operation(
  _organisation_id uuid,
  _property_id uuid,
  _connection_id uuid,
  _provider_key text,
  _environment text,
  _operation text,
  _capability text,
  _idempotency_key text,
  _request_fingerprint text,
  _correlation_id text,
  _request_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(operation_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _id uuid;
  _existing_fingerprint text;
BEGIN
  IF _organisation_id IS NULL OR _property_id IS NULL OR _connection_id IS NULL
    OR _provider_key IS NULL OR _environment NOT IN ('sandbox','live')
    OR _operation IS NULL OR length(trim(_operation)) NOT BETWEEN 1 AND 96
    OR _capability IS NULL
    OR _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 128
    OR _request_fingerprint IS NULL OR _request_fingerprint !~ '^[0-9a-f]{64}$'
    OR _correlation_id IS NULL OR length(trim(_correlation_id)) NOT BETWEEN 1 AND 128
    OR _request_payload IS NULL OR jsonb_typeof(_request_payload) <> 'object'
  THEN
    RAISE EXCEPTION 'Invalid distribution operation envelope.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staynas_distribution_operation_ledger(
    organisation_id,property_id,connection_id,provider_key,environment,
    operation,capability,idempotency_key,request_fingerprint,correlation_id,request_payload
  ) VALUES (
    _organisation_id,_property_id,_connection_id,_provider_key,_environment,
    _operation,_capability,_idempotency_key,_request_fingerprint,_correlation_id,_request_payload
  )
  ON CONFLICT (property_id,connection_id,operation,idempotency_key) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL THEN
    RETURN QUERY SELECT _id, true;
    RETURN;
  END IF;

  SELECT l.id,l.request_fingerprint
    INTO _id,_existing_fingerprint
  FROM public.staynas_distribution_operation_ledger l
  WHERE l.property_id=_property_id AND l.connection_id=_connection_id
    AND l.operation=_operation AND l.idempotency_key=_idempotency_key
  FOR UPDATE;

  IF _id IS NULL OR _existing_fingerprint IS DISTINCT FROM _request_fingerprint THEN
    RAISE EXCEPTION 'Idempotency key was reused with a different request.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT _id, false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_claim_distribution_operation(
  _worker_id text,
  _lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.staynas_distribution_operation_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_operation_ledger%ROWTYPE;
  _new_token uuid;
BEGIN
  IF _worker_id IS NULL OR length(trim(_worker_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid worker identity.' USING ERRCODE = '22023';
  END IF;
  IF _lease_seconds IS NULL OR _lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid worker lease duration.' USING ERRCODE = '22023';
  END IF;

  SELECT l.* INTO _row
  FROM public.staynas_distribution_operation_ledger l
  WHERE l.attempt_count < l.max_attempts
    AND (
      (l.status IN ('queued','retryable_failure') AND l.next_attempt_at <= pg_catalog.now())
      OR (l.status='running' AND l.lease_expires_at < pg_catalog.now())
    )
  ORDER BY l.next_attempt_at,l.created_at,l.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _row.id IS NULL THEN
    RETURN;
  END IF;

  IF _row.status = 'running' THEN
    INSERT INTO public.staynas_distribution_operation_attempts(
      operation_id,organisation_id,property_id,attempt_number,worker_id,status,
      normalized_error_code,safe_summary,correlation_id,started_at,finished_at
    ) VALUES (
      _row.id,_row.organisation_id,_row.property_id,_row.attempt_count,
      coalesce(_row.lease_owner,'unknown'),'lease_expired','timeout',
      'Worker lease expired before operation completion.',
      _row.correlation_id,coalesce(_row.lease_expires_at,_row.updated_at),pg_catalog.now()
    ) ON CONFLICT (operation_id,attempt_number) DO NOTHING;
  END IF;

  _new_token := pg_catalog.gen_random_uuid();
  UPDATE public.staynas_distribution_operation_ledger l
  SET status='running',
      attempt_count=l.attempt_count+1,
      lease_token=_new_token,
      lease_owner=_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>_lease_seconds),
      updated_at=pg_catalog.now(),
      normalized_error_code=NULL,
      safe_error_summary=NULL
  WHERE l.id=_row.id
  RETURNING l.* INTO _row;

  RETURN NEXT _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_finish_distribution_operation(
  _operation_id uuid,
  _lease_token uuid,
  _worker_id text,
  _status text,
  _normalized_error_code text DEFAULT NULL,
  _safe_summary text DEFAULT NULL,
  _provider_reference text DEFAULT NULL,
  _result_reference text DEFAULT NULL,
  _response_code integer DEFAULT NULL,
  _duration_ms integer DEFAULT NULL,
  _retry_after_seconds integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_operation_ledger%ROWTYPE;
BEGIN
  SELECT l.* INTO _row
  FROM public.staynas_distribution_operation_ledger l
  WHERE l.id=_operation_id AND l.status='running'
    AND l.lease_token=_lease_token AND l.lease_owner=_worker_id
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Operation lease is not current.' USING ERRCODE = '42501';
  END IF;

  IF _status NOT IN ('succeeded','retryable_failure','permanent_failure')
    OR (_status='succeeded' AND (_normalized_error_code IS NOT NULL OR _safe_summary IS NOT NULL))
    OR (_status<>'succeeded' AND (_normalized_error_code IS NULL OR _safe_summary IS NULL))
    OR (_status='retryable_failure' AND (_retry_after_seconds IS NULL OR _retry_after_seconds NOT BETWEEN 1 AND 86400))
    OR (_status<>'retryable_failure' AND _retry_after_seconds IS NOT NULL)
    OR (_response_code IS NOT NULL AND _response_code NOT BETWEEN 100 AND 599)
    OR (_duration_ms IS NOT NULL AND _duration_ms < 0)
    OR (_safe_summary IS NOT NULL AND length(_safe_summary)>500)
  THEN
    RAISE EXCEPTION 'Invalid distribution operation result.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staynas_distribution_operation_attempts(
    operation_id,organisation_id,property_id,attempt_number,worker_id,status,
    normalized_error_code,safe_summary,provider_request_reference,response_code,
    duration_ms,correlation_id,started_at,finished_at
  ) VALUES (
    _row.id,_row.organisation_id,_row.property_id,_row.attempt_count,_worker_id,
    _status,_normalized_error_code,_safe_summary,_provider_reference,_response_code,
    _duration_ms,_row.correlation_id,
    coalesce(_row.lease_expires_at - pg_catalog.make_interval(secs=>60),_row.updated_at),
    pg_catalog.now()
  );

  UPDATE public.staynas_distribution_operation_ledger l
  SET status=CASE WHEN _status='retryable_failure' AND l.attempt_count>=l.max_attempts
                  THEN 'permanent_failure' ELSE _status END,
      next_attempt_at=CASE WHEN _status='retryable_failure' AND l.attempt_count<l.max_attempts
                           THEN pg_catalog.now()+pg_catalog.make_interval(secs=>_retry_after_seconds)
                           ELSE l.next_attempt_at END,
      provider_reference=_provider_reference,
      result_reference=_result_reference,
      normalized_error_code=_normalized_error_code,
      safe_error_summary=_safe_summary,
      lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      completed_at=CASE WHEN _status='succeeded' OR _status='permanent_failure'
                             OR (_status='retryable_failure' AND l.attempt_count>=l.max_attempts)
                        THEN pg_catalog.now() ELSE NULL END,
      updated_at=pg_catalog.now()
  WHERE l.id=_row.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_receive_distribution_webhook(
  _organisation_id uuid,
  _property_id uuid,
  _account_grant_id uuid,
  _external_account_id uuid,
  _provider_key text,
  _environment text,
  _provider_event_id text,
  _event_type text,
  _payload_fingerprint text,
  _normalized_event jsonb,
  _correlation_id text
)
RETURNS TABLE(inbox_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _id uuid;
  _existing_fingerprint text;
BEGIN
  IF _payload_fingerprint IS NULL OR _payload_fingerprint !~ '^[0-9a-f]{64}$'
    OR _normalized_event IS NULL OR pg_catalog.jsonb_typeof(_normalized_event) <> 'object'
    OR _correlation_id IS NULL OR length(pg_catalog.btrim(_correlation_id)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'Invalid distribution webhook envelope.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_inbox(
    organisation_id,property_id,account_grant_id,external_account_id,
    provider_key,environment,provider_event_id,event_type,payload_fingerprint,
    normalized_event,correlation_id
  ) VALUES (
    _organisation_id,_property_id,_account_grant_id,_external_account_id,
    _provider_key,_environment,_provider_event_id,_event_type,_payload_fingerprint,
    _normalized_event,_correlation_id
  )
  ON CONFLICT (provider_key,external_account_id,provider_event_id) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL THEN
    RETURN QUERY SELECT _id,true;
    RETURN;
  END IF;

  SELECT i.id,i.payload_fingerprint INTO _id,_existing_fingerprint
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.provider_key=_provider_key AND i.external_account_id=_external_account_id
    AND i.provider_event_id=_provider_event_id
  FOR UPDATE;

  IF _id IS NULL OR _existing_fingerprint IS DISTINCT FROM _payload_fingerprint THEN
    RAISE EXCEPTION 'Provider event identifier was reused with a different payload.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT _id,false;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_enqueue_distribution_operation(uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_claim_distribution_operation(text,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_finish_distribution_operation(uuid,uuid,text,text,text,text,text,text,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_receive_distribution_webhook(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_enqueue_distribution_operation(uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_claim_distribution_operation(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_finish_distribution_operation(uuid,uuid,text,text,text,text,text,text,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_receive_distribution_webhook(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text) TO service_role;

COMMIT;
