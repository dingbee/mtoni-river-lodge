-- DC-04.10 — durable outbox dispatch primitives.
-- ARTIFACT ONLY: apply in isolated PostgreSQL CI; never shared production.
BEGIN;

ALTER TABLE public.staynas_distribution_outbox
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5
  CHECK (max_attempts BETWEEN 1 AND 20);

CREATE OR REPLACE FUNCTION public.staynas_enqueue_distribution_outbox(
  _organisation_id uuid,
  _property_id uuid,
  _connection_id uuid,
  _operation_id uuid,
  _event_key text,
  _event_type text,
  _event_payload jsonb,
  _correlation_id text
)
RETURNS TABLE(outbox_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _id uuid;
  _existing public.staynas_distribution_outbox%ROWTYPE;
BEGIN
  IF _organisation_id IS NULL OR _property_id IS NULL OR _connection_id IS NULL
    OR _event_key IS NULL OR length(pg_catalog.btrim(_event_key)) NOT BETWEEN 8 AND 160
    OR _event_type IS NULL OR length(pg_catalog.btrim(_event_type)) NOT BETWEEN 1 AND 96
    OR _event_payload IS NULL OR pg_catalog.jsonb_typeof(_event_payload) <> 'object'
    OR _correlation_id IS NULL OR length(pg_catalog.btrim(_correlation_id)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'Invalid distribution outbox envelope.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_key,
    event_type,event_payload,correlation_id
  ) VALUES (
    _organisation_id,_property_id,_connection_id,_operation_id,_event_key,
    _event_type,_event_payload,_correlation_id
  )
  ON CONFLICT (property_id,event_key) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL THEN
    RETURN QUERY SELECT _id,true;
    RETURN;
  END IF;

  SELECT o.* INTO _existing
  FROM public.staynas_distribution_outbox o
  WHERE o.property_id=_property_id AND o.event_key=_event_key
  FOR UPDATE;

  IF _existing.id IS NULL
    OR _existing.organisation_id IS DISTINCT FROM _organisation_id
    OR _existing.connection_id IS DISTINCT FROM _connection_id
    OR _existing.operation_id IS DISTINCT FROM _operation_id
    OR _existing.event_type IS DISTINCT FROM _event_type
    OR _existing.event_payload IS DISTINCT FROM _event_payload
  THEN
    RAISE EXCEPTION 'Outbox event key was reused with a different event.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT _existing.id,false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_claim_distribution_outbox(
  _worker_id text,
  _lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.staynas_distribution_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_outbox%ROWTYPE;
  _new_token uuid;
BEGIN
  IF _worker_id IS NULL OR length(pg_catalog.btrim(_worker_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid outbox worker identity.' USING ERRCODE = '22023';
  END IF;
  IF _lease_seconds IS NULL OR _lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid outbox worker lease duration.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.staynas_distribution_outbox o
  SET status='permanent_failure',
      lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      safe_error_summary='Outbox delivery exhausted its retry budget.',
      updated_at=pg_catalog.now()
  WHERE o.attempt_count >= o.max_attempts
    AND (
      o.status IN ('pending','retryable_failure')
      OR (o.status='publishing' AND o.lease_expires_at < pg_catalog.now())
    );

  SELECT o.* INTO _row
  FROM public.staynas_distribution_outbox o
  WHERE o.attempt_count < o.max_attempts
    AND (
      (o.status IN ('pending','retryable_failure') AND o.next_attempt_at <= pg_catalog.now())
      OR (o.status='publishing' AND o.lease_expires_at < pg_catalog.now())
    )
  ORDER BY o.next_attempt_at,o.created_at,o.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _row.id IS NULL THEN
    RETURN;
  END IF;

  _new_token := pg_catalog.gen_random_uuid();
  UPDATE public.staynas_distribution_outbox o
  SET status='publishing',
      attempt_count=o.attempt_count+1,
      lease_token=_new_token,
      lease_owner=_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>_lease_seconds),
      updated_at=pg_catalog.now(),
      safe_error_summary=NULL
  WHERE o.id=_row.id
  RETURNING o.* INTO _row;

  RETURN NEXT _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_finish_distribution_outbox(
  _outbox_id uuid,
  _lease_token uuid,
  _worker_id text,
  _status text,
  _safe_summary text DEFAULT NULL,
  _retry_after_seconds integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _row public.staynas_distribution_outbox%ROWTYPE;
BEGIN
  SELECT o.* INTO _row
  FROM public.staynas_distribution_outbox o
  WHERE o.id=_outbox_id AND o.status='publishing'
    AND o.lease_token=_lease_token AND o.lease_owner=_worker_id
    AND o.lease_expires_at > pg_catalog.now()
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Outbox delivery lease is not current.' USING ERRCODE = '42501';
  END IF;

  IF _status NOT IN ('published','retryable_failure','permanent_failure')
    OR (_status='published' AND (_safe_summary IS NOT NULL OR _retry_after_seconds IS NOT NULL))
    OR (_status='retryable_failure' AND (_safe_summary IS NULL OR length(_safe_summary)>500
        OR _retry_after_seconds IS NULL OR _retry_after_seconds NOT BETWEEN 1 AND 86400))
    OR (_status='permanent_failure' AND (_safe_summary IS NULL OR length(_safe_summary)>500
        OR _retry_after_seconds IS NOT NULL))
  THEN
    RAISE EXCEPTION 'Invalid distribution outbox result.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.staynas_distribution_outbox o
  SET status=CASE
        WHEN _status='retryable_failure' AND o.attempt_count>=o.max_attempts THEN 'permanent_failure'
        ELSE _status
      END,
      next_attempt_at=CASE
        WHEN _status='retryable_failure' AND o.attempt_count<o.max_attempts
          THEN pg_catalog.now()+pg_catalog.make_interval(secs=>_retry_after_seconds)
        ELSE o.next_attempt_at
      END,
      published_at=CASE WHEN _status='published' THEN pg_catalog.now() ELSE NULL END,
      safe_error_summary=CASE
        WHEN _status='published' THEN NULL
        WHEN _status='retryable_failure' AND o.attempt_count>=o.max_attempts
          THEN 'Outbox delivery exhausted its retry budget.'
        ELSE _safe_summary
      END,
      lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      updated_at=pg_catalog.now()
  WHERE o.id=_row.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_enqueue_distribution_outbox(uuid,uuid,uuid,uuid,text,text,jsonb,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_claim_distribution_outbox(text,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_finish_distribution_outbox(uuid,uuid,text,text,text,integer)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_enqueue_distribution_outbox(uuid,uuid,uuid,uuid,text,text,jsonb,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_claim_distribution_outbox(text,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_finish_distribution_outbox(uuid,uuid,text,text,text,integer)
  TO service_role;

COMMIT;
