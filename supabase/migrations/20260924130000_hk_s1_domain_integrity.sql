-- HK-S1: Housekeeping domain integrity
-- Canonical execution model: active cleaning is represented by the housekeeping
-- task status; room_states remains the operational room-readiness state.

CREATE TABLE IF NOT EXISTS public.housekeeping_transition_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_state_id uuid NOT NULL REFERENCES public.room_states(id) ON DELETE CASCADE,
  from_state public.room_state NOT NULL,
  to_state public.room_state NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS housekeeping_transition_room_idx
  ON public.housekeeping_transition_log(room_state_id, created_at DESC);

ALTER TABLE public.housekeeping_transition_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read housekeeping transition log"
  ON public.housekeeping_transition_log;

CREATE POLICY "Staff read housekeeping transition log"
  ON public.housekeeping_transition_log
  FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.housekeeping_transition_log FROM authenticated;
GRANT SELECT ON public.housekeeping_transition_log TO authenticated;
GRANT ALL ON public.housekeeping_transition_log TO service_role;

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
  _current public.room_states%ROWTYPE;
  _existing public.housekeeping_transition_log%ROWTYPE;
  _result public.room_states%ROWTYPE;
  _is_supervisor boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_any_staff(_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  SELECT *
    INTO _existing
  FROM public.housekeeping_transition_log
  WHERE idempotency_key = _idempotency_key;

  IF FOUND THEN
    SELECT * INTO _result
    FROM public.room_states
    WHERE id = _existing.room_state_id;
    RETURN _result;
  END IF;

  SELECT *
    INTO _current
  FROM public.room_states
  WHERE id = _room_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room state not found';
  END IF;

  _is_supervisor := public.has_any_role(
    _uid,
    ARRAY['admin'::public.app_role, 'owner'::public.app_role, 'manager'::public.app_role]
  );

  -- Housekeeping staff may only execute housekeeping lifecycle transitions.
  IF NOT _is_supervisor
     AND NOT public.has_any_role(_uid, ARRAY['housekeeping'::public.app_role])
  THEN
    RAISE EXCEPTION 'Housekeeping transition requires housekeeping or supervisor role';
  END IF;

  IF NOT _is_supervisor THEN
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state = 'inspection')
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean', 'vacant_dirty'))
    ) THEN
      RAISE EXCEPTION 'Invalid housekeeping transition: % -> %', _current.state, _to_state;
    END IF;
  ELSE
    IF NOT (
      (_current.state = 'vacant_dirty' AND _to_state IN ('inspection', 'maintenance', 'out_of_service'))
      OR (_current.state = 'inspection' AND _to_state IN ('vacant_clean', 'vacant_dirty', 'maintenance', 'out_of_service'))
      OR (_current.state = 'vacant_clean' AND _to_state IN ('vacant_dirty', 'maintenance', 'out_of_service'))
      OR (_current.state = 'maintenance' AND _to_state IN ('vacant_dirty', 'vacant_clean', 'out_of_service'))
      OR (_current.state = 'out_of_service' AND _to_state IN ('maintenance', 'vacant_dirty', 'vacant_clean'))
    ) THEN
      RAISE EXCEPTION 'Invalid room-readiness transition: % -> %', _current.state, _to_state;
    END IF;
  END IF;

  UPDATE public.room_states
  SET state = _to_state,
      state_note = NULLIF(trim(COALESCE(_note, '')), ''),
      updated_by = _uid,
      updated_at = now()
  WHERE id = _room_state_id
  RETURNING * INTO _result;

  INSERT INTO public.housekeeping_transition_log (
    room_state_id, from_state, to_state, actor_id, idempotency_key, note
  ) VALUES (
    _room_state_id, _current.state, _to_state, _uid, _idempotency_key, _note
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.housekeeping_transition_room_state(uuid, public.room_state, text, text)
IS 'Canonical, atomic, idempotent room-readiness transition for the StayNas Housekeeping domain. Active cleaning is tracked by task status; room readiness advances through inspection.';
