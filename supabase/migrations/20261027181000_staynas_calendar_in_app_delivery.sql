-- Deliver in-app calendar notifications to the existing StayNas notification centre.
-- Email remains queued for the configured email delivery worker; it is never marked sent here.

CREATE OR REPLACE FUNCTION public.staynas_calendar_deliver_in_app_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_href text;
  v_kind text;
BEGIN
  IF NEW.channel <> 'in_app' OR NEW.status <> 'queued' OR NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Re-check recipient/property membership at delivery time, not only when queued.
  IF NOT public.staynas_user_has_property_access(NEW.recipient_id, NEW.property_id) THEN
    UPDATE public.staynas_calendar_notification_outbox
      SET status = 'failed',
          attempt_count = attempt_count + 1,
          last_error = 'Recipient no longer has access to this property',
          updated_at = now()
    WHERE id = NEW.id AND status = 'queued';
    RETURN NEW;
  END IF;

  v_title := COALESCE(NULLIF(NEW.payload->>'title',''), 'StayNas calendar update');
  v_body := COALESCE(NULLIF(NEW.payload->>'body',''), NEW.event_type);
  v_href := NULLIF(NEW.payload->>'href','');
  v_kind := COALESCE(NULLIF(NEW.payload->>'kind',''), 'calendar');

  -- Outbox idempotency key is unique per property/recipient/channel.
  -- The notification row is created only once for this outbox event.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.recipient_id
      AND n.channel = 'in_app'
      AND n.meta->>'staynas_calendar_outbox_id' = NEW.id::text
  ) THEN
    INSERT INTO public.notifications (
      user_id, channel, title, body, href, kind, meta, delivered_at
    ) VALUES (
      NEW.recipient_id, 'in_app', v_title, v_body, v_href, v_kind,
      COALESCE(NEW.payload, '{}'::jsonb) || jsonb_build_object(
        'staynas_calendar_outbox_id', NEW.id::text,
        'property_id', NEW.property_id::text,
        'event_type', NEW.event_type
      ),
      now()
    );
  END IF;

  UPDATE public.staynas_calendar_notification_outbox
    SET status = 'sent',
        delivered_at = COALESCE(delivered_at, now()),
        attempt_count = attempt_count + 1,
        last_error = NULL,
        updated_at = now()
  WHERE id = NEW.id AND status = 'queued';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_calendar_in_app_delivery ON public.staynas_calendar_notification_outbox;
CREATE TRIGGER staynas_calendar_in_app_delivery
  AFTER INSERT ON public.staynas_calendar_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.staynas_calendar_deliver_in_app_notification();

REVOKE ALL ON FUNCTION public.staynas_calendar_deliver_in_app_notification() FROM PUBLIC, anon, authenticated;
