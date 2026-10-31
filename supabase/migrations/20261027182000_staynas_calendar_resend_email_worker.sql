-- Supabase-native transactional email delivery for StayNas calendar notifications.
-- Uses a locked claim step so concurrent workers cannot send the same queued row.
-- Delivery is performed by the staynas-calendar-email-worker Edge Function via Resend.

CREATE OR REPLACE FUNCTION public.staynas_calendar_claim_email_notifications(_batch_size integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  recipient_id uuid,
  property_id uuid,
  event_type text,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _batch_size < 1 OR _batch_size > 100 THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 100';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.staynas_calendar_notification_outbox o
    WHERE o.channel = 'email'
      AND o.status = 'queued'
      AND o.scheduled_for <= pg_catalog.now()
      AND o.recipient_id IS NOT NULL
    ORDER BY o.scheduled_for, o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _batch_size
  )
  UPDATE public.staynas_calendar_notification_outbox o
  SET status = 'processing',
      attempt_count = o.attempt_count + 1,
      updated_at = pg_catalog.now()
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.id, o.recipient_id, o.property_id, o.event_type, o.payload, o.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_calendar_finish_email_notification(
  _notification_id uuid,
  _success boolean,
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt_count integer;
BEGIN
  SELECT o.attempt_count INTO v_attempt_count
  FROM public.staynas_calendar_notification_outbox o
  WHERE o.id = _notification_id AND o.channel = 'email' AND o.status = 'processing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email notification is not currently processing';
  END IF;

  IF _success THEN
    UPDATE public.staynas_calendar_notification_outbox
    SET status = 'sent',
        delivered_at = pg_catalog.now(),
        last_error = NULL,
        updated_at = pg_catalog.now()
    WHERE id = _notification_id;
  ELSIF v_attempt_count >= 5 THEN
    UPDATE public.staynas_calendar_notification_outbox
    SET status = 'failed',
        last_error = pg_catalog.left(COALESCE(_error, 'Email delivery failed'), 1000),
        updated_at = pg_catalog.now()
    WHERE id = _notification_id;
  ELSE
    UPDATE public.staynas_calendar_notification_outbox
    SET status = 'queued',
        scheduled_for = pg_catalog.now() + (pg_catalog.power(2, v_attempt_count)::integer * interval '1 minute'),
        last_error = pg_catalog.left(COALESCE(_error, 'Email delivery failed'), 1000),
        updated_at = pg_catalog.now()
    WHERE id = _notification_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_claim_email_notifications(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_calendar_finish_email_notification(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_claim_email_notifications(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_finish_email_notification(uuid, boolean, text) TO service_role;
