-- Housekeeping tenant boundary hardening.
-- Covers status-only task transitions and direct room-state transition RPC calls.

DROP TRIGGER IF EXISTS staynas_housekeeping_task_property_guard ON public.ops_tasks;
CREATE TRIGGER staynas_housekeeping_task_property_guard
BEFORE INSERT OR UPDATE OF category, room_state_id, booking_id, assignee_id, status
ON public.ops_tasks
FOR EACH ROW
EXECUTE FUNCTION public.staynas_guard_housekeeping_task_property();

-- Preserve the existing lifecycle rules behind a property-scoped RPC boundary.
ALTER FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
  RENAME TO housekeeping_transition_room_state_unscoped;

REVOKE ALL ON FUNCTION public.housekeeping_transition_room_state_unscoped(uuid, public.room_state, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.housekeeping_transition_room_state(
  _room_state_id uuid,
  _to_state public.room_state,
  _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.room_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _property_id uuid;
  _current public.room_states%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.is_any_staff(_uid) THEN
    RAISE EXCEPTION 'Authentication and staff access required';
  END IF;

  _property_id := public.staynas_active_property_id(_uid);
  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Active property access required';
  END IF;

  SELECT * INTO _current
  FROM public.room_states
  WHERE id = _room_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room state not found';
  END IF;

  IF _current.property_id IS DISTINCT FROM _property_id THEN
    RAISE EXCEPTION 'Room state is outside the active property';
  END IF;

  RETURN public.housekeeping_transition_room_state_unscoped(
    _room_state_id, _to_state, _note, _idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
IS 'Enforces active-property scope before delegating to the existing housekeeping room-state lifecycle rules.';
