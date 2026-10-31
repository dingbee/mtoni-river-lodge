-- HK re-clean dispatch and execution: enforce tenant scope at the task row boundary.
-- The inspection row lock + status transition in housekeeping_submit_inspection()
-- makes failed-inspection re-clean creation transactional and retry-safe.

CREATE OR REPLACE FUNCTION public.staynas_guard_housekeeping_task_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _room_property_id uuid;
  _booking_property_id uuid;
BEGIN
  IF NEW.category <> 'housekeeping' THEN
    RETURN NEW;
  END IF;

  -- Permit trusted backend maintenance, but never infer a tenant for an
  -- authenticated user with no active property context.
  IF _uid IS NULL THEN
    IF COALESCE(auth.role(), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Authentication required for housekeeping task changes';
  END IF;

  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Active property access required';
  END IF;

  IF NEW.room_state_id IS NULL THEN
    RAISE EXCEPTION 'Housekeeping task must reference a room state';
  END IF;

  SELECT property_id INTO _room_property_id
  FROM public.room_states
  WHERE id = NEW.room_state_id;

  IF NOT FOUND OR _room_property_id IS DISTINCT FROM _property_id THEN
    RAISE EXCEPTION 'Housekeeping task room is outside the active property';
  END IF;

  IF NEW.booking_id IS NOT NULL THEN
    SELECT property_id INTO _booking_property_id
    FROM public.bookings
    WHERE id = NEW.booking_id;

    IF NOT FOUND OR _booking_property_id IS DISTINCT FROM _property_id THEN
      RAISE EXCEPTION 'Housekeeping task booking is outside the active property';
    END IF;
  END IF;

  IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.staynas_property_members pm
    WHERE pm.user_id = NEW.assignee_id
      AND pm.property_id = _property_id
      AND pm.status = 'active'
      AND pm.role = 'housekeeping'
  ) THEN
    RAISE EXCEPTION 'Housekeeping assignee is not an active member of this property';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_housekeeping_task_property_guard ON public.ops_tasks;
CREATE TRIGGER staynas_housekeeping_task_property_guard
BEFORE INSERT OR UPDATE OF category, room_state_id, booking_id, assignee_id
ON public.ops_tasks
FOR EACH ROW
EXECUTE FUNCTION public.staynas_guard_housekeeping_task_property();

-- Explicitly document the retry contract: failed inspection status is committed
-- in the same transaction as re-clean task insertion; the inspection row lock
-- serializes concurrent submissions, and later retries return the terminal row.
COMMENT ON FUNCTION public.housekeeping_submit_inspection(uuid,jsonb,boolean,text,text)
IS 'Property-scoped supervisor inspection. Locks the inspection row; pass/fail state and re-clean task insertion commit atomically, making retries idempotent.';
