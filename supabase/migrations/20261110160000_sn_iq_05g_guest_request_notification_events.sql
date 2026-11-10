-- SN-IQ-05G notification lifecycle refinement.
-- Status-note changes (assignment details, additional information and staff updates)
-- must remain in the same durable notification queue as status transitions.

CREATE OR REPLACE FUNCTION public.staynas_queue_guest_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _summary text;
BEGIN
  IF NEW.booking_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    _event := 'guest_request_received';
    _summary := 'New guest ' || replace(NEW.category, '_', ' ') || ' request';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := 'guest_request_status_changed';
    _summary := 'Guest request ' || replace(NEW.status, '_', ' ');
  ELSIF NEW.status_note IS DISTINCT FROM OLD.status_note THEN
    _event := 'guest_request_update';
    _summary := COALESCE(NULLIF(NEW.status_note, ''), 'There is an update to your guest request');
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.pending_notifications (booking_id, event_type, payload)
  VALUES (
    NEW.booking_id,
    _event,
    jsonb_build_object(
      'request_id', NEW.id,
      'category', NEW.category,
      'status', NEW.status,
      'status_note', NEW.status_note,
      'summary', _summary,
      'request_summary', left(NEW.request_text, 160)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_notification_status ON public.staynas_guest_requests;
CREATE TRIGGER staynas_guest_request_notification_status
  AFTER UPDATE OF status, status_note ON public.staynas_guest_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.status_note IS DISTINCT FROM NEW.status_note)
  EXECUTE FUNCTION public.staynas_queue_guest_request_notification();

REVOKE ALL ON FUNCTION public.staynas_queue_guest_request_notification() FROM PUBLIC, anon, authenticated;
