-- SN-IQ-05G: preserve note-only operational updates in the guest request audit trail.

CREATE OR REPLACE FUNCTION public.staynas_guest_request_audit_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _history jsonb;
  _tasks jsonb;
  _notes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{status_history}',
      jsonb_build_array(jsonb_build_object(
        'status', NEW.status,
        'note', COALESCE(NULLIF(NEW.status_note, ''), 'Request received'),
        'actor_id', NEW.status_updated_by,
        'occurred_at', now()
      )),
      true
    );
    IF NULLIF(NEW.status_note,'') IS NOT NULL THEN
      NEW.metadata := jsonb_set(
        NEW.metadata,
        '{status_note_history}',
        jsonb_build_array(jsonb_build_object(
          'note', NEW.status_note,
          'actor_id', NEW.status_updated_by,
          'occurred_at', now()
        )),
        true
      );
    END IF;
    RETURN NEW;
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, OLD.metadata, '{}'::jsonb);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _history := CASE
      WHEN jsonb_typeof(OLD.metadata->'status_history')='array' THEN OLD.metadata->'status_history'
      ELSE '[]'::jsonb
    END;
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{status_history}',
      _history || jsonb_build_array(jsonb_build_object(
        'status', NEW.status,
        'note', NULLIF(NEW.status_note, ''),
        'actor_id', NEW.status_updated_by,
        'occurred_at', now()
      )),
      true
    );
  END IF;

  IF NEW.status_note IS DISTINCT FROM OLD.status_note AND NULLIF(NEW.status_note,'') IS NOT NULL THEN
    _notes := CASE
      WHEN jsonb_typeof(OLD.metadata->'status_note_history')='array' THEN OLD.metadata->'status_note_history'
      ELSE '[]'::jsonb
    END;
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{status_note_history}',
      _notes || jsonb_build_array(jsonb_build_object(
        'note', NEW.status_note,
        'actor_id', NEW.status_updated_by,
        'occurred_at', now()
      )),
      true
    );
  END IF;

  IF NEW.operational_task_id IS DISTINCT FROM OLD.operational_task_id
     AND NEW.operational_task_id IS NOT NULL THEN
    _tasks := CASE
      WHEN jsonb_typeof(OLD.metadata->'operational_task_history')='array' THEN OLD.metadata->'operational_task_history'
      ELSE '[]'::jsonb
    END;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_tasks) AS task_items(task)
      WHERE task->>'task_id' = NEW.operational_task_id::text
    ) THEN
      NEW.metadata := jsonb_set(
        NEW.metadata,
        '{operational_task_history}',
        _tasks || jsonb_build_array(jsonb_build_object(
          'task_id', NEW.operational_task_id,
          'linked_at', now()
        )),
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_guest_request_audit_metadata ON public.staynas_guest_requests;
CREATE TRIGGER staynas_guest_request_audit_metadata
  BEFORE INSERT OR UPDATE OF status, status_note, operational_task_id
  ON public.staynas_guest_requests
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guest_request_audit_metadata();

REVOKE ALL ON FUNCTION public.staynas_guest_request_audit_metadata() FROM PUBLIC,anon,authenticated;
