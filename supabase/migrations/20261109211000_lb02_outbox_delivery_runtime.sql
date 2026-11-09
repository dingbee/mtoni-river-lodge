-- LB-02.05 — bounded transactional outbox leasing, delivery evidence and retry policy.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lb02_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.lb02_outbox_events(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('accepted','retryable_failure','terminal_failure')),
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lb02_delivery_attempts_uq UNIQUE(event_id, attempt_number)
);
CREATE INDEX IF NOT EXISTS lb02_delivery_attempts_connection_idx
 ON public.lb02_delivery_attempts(connection_id, created_at DESC);
ALTER TABLE public.lb02_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lb02_delivery_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lb02_delivery_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.lb02_claim_outbox_events(_connection_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(event_id uuid,event_type text,event_version integer,aggregate_id uuid,aggregate_version bigint,
 correlation_id text,causation_id uuid,idempotency_key text,payload jsonb,attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $lb02$
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN
   RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.staynas_product_connections c
   WHERE c.id=_connection_id AND c.status='active'
   AND c.local_approved_at IS NOT NULL AND c.remote_approved_at IS NOT NULL) THEN
   RAISE EXCEPTION 'LB-02 connection is not active' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 WITH candidates AS (
   SELECT e.id FROM public.lb02_outbox_events e
   WHERE e.connection_id=_connection_id
     AND e.state IN ('pending','leased')
     AND e.available_at <= now()
     AND (e.state='pending' OR e.leased_at < now()-interval '2 minutes')
   ORDER BY e.created_at
   LIMIT greatest(1,least(coalesce(_limit,25),100))
   FOR UPDATE SKIP LOCKED
 ), claimed AS (
   UPDATE public.lb02_outbox_events e
   SET state='leased', leased_at=now(), attempt_count=e.attempt_count+1
   FROM candidates c WHERE e.id=c.id
   RETURNING e.*
 )
 SELECT c.id,c.event_type,c.event_version,c.aggregate_id,c.aggregate_version,
   c.correlation_id,c.causation_id,c.idempotency_key,c.payload,c.attempt_count
 FROM claimed c;
END;
$lb02$;

CREATE OR REPLACE FUNCTION public.lb02_record_outbox_delivery(
 _event_id uuid,_outcome text,_http_status integer DEFAULT NULL,_error_code text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $lb02$
DECLARE v_event public.lb02_outbox_events%ROWTYPE; v_next timestamptz;
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN
   RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_event FROM public.lb02_outbox_events WHERE id=_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox event not found' USING ERRCODE='P0002'; END IF;
 IF v_event.state IN ('delivered','dead_lettered','cancelled') THEN RETURN v_event.state; END IF;
 IF _outcome NOT IN ('accepted','retryable_failure','terminal_failure') THEN
   RAISE EXCEPTION 'Invalid delivery outcome' USING ERRCODE='22023';
 END IF;
 IF _http_status IS NOT NULL AND _http_status NOT BETWEEN 100 AND 599 THEN
   RAISE EXCEPTION 'Invalid HTTP status' USING ERRCODE='22023';
 END IF;
 IF _outcome='accepted' THEN
   UPDATE public.lb02_outbox_events SET state='delivered',delivered_at=now(),leased_at=NULL,last_error_code=NULL
   WHERE id=_event_id;
   INSERT INTO public.lb02_delivery_attempts(event_id,connection_id,attempt_number,outcome,http_status)
   VALUES (_event_id,v_event.connection_id,v_event.attempt_count,'accepted',_http_status)
   ON CONFLICT(event_id,attempt_number) DO NOTHING;
   RETURN 'delivered';
 ELSIF _outcome='terminal_failure' OR v_event.attempt_count >= 10 THEN
   UPDATE public.lb02_outbox_events SET state='dead_lettered',leased_at=NULL,
     last_error_code=left(coalesce(_error_code,'terminal_failure'),80)
   WHERE id=_event_id;
   INSERT INTO public.lb02_delivery_attempts(event_id,connection_id,attempt_number,outcome,http_status,error_code)
   VALUES (_event_id,v_event.connection_id,v_event.attempt_count,'terminal_failure',_http_status,left(coalesce(_error_code,'terminal_failure'),80))
   ON CONFLICT(event_id,attempt_number) DO NOTHING;
   RETURN 'dead_lettered';
 ELSE
   v_next := now() + make_interval(secs => least(3600,15 * power(2,least(v_event.attempt_count-1,8))::integer) * (0.5 + random()));
   UPDATE public.lb02_outbox_events SET state='pending',leased_at=NULL,available_at=v_next,
     last_error_code=left(coalesce(_error_code,'retryable_failure'),80)
   WHERE id=_event_id;
   INSERT INTO public.lb02_delivery_attempts(event_id,connection_id,attempt_number,outcome,http_status,error_code,next_attempt_at)
   VALUES (_event_id,v_event.connection_id,v_event.attempt_count,'retryable_failure',_http_status,left(coalesce(_error_code,'retryable_failure'),80),v_next)
   ON CONFLICT(event_id,attempt_number) DO NOTHING;
   RETURN 'retry_scheduled';
 END IF;
END;
$lb02$;
REVOKE ALL ON FUNCTION public.lb02_claim_outbox_events(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lb02_record_outbox_delivery(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb02_claim_outbox_events(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lb02_record_outbox_delivery(uuid,text,integer,text) TO service_role;
COMMIT;