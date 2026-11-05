-- HK-S4: Housekeeping exceptions and operational handling
CREATE TABLE IF NOT EXISTS public.housekeeping_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_state_id uuid NOT NULL REFERENCES public.room_states(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.ops_tasks(id) ON DELETE SET NULL,
  exception_type text NOT NULL CHECK (exception_type IN ('dnd','discrepancy','damage','maintenance','lost_found','linen_amenity')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','cancelled')),
  severity integer NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 200),
  notes text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS housekeeping_exceptions_room_idx
  ON public.housekeeping_exceptions(room_state_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS housekeeping_exceptions_open_idx
  ON public.housekeeping_exceptions(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS housekeeping_exceptions_type_idx
  ON public.housekeeping_exceptions(exception_type, status, created_at DESC);

ALTER TABLE public.housekeeping_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read housekeeping exceptions" ON public.housekeeping_exceptions;
CREATE POLICY "Staff read housekeeping exceptions"
  ON public.housekeeping_exceptions FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.housekeeping_exceptions FROM authenticated, anon;
GRANT SELECT ON public.housekeeping_exceptions TO authenticated;
GRANT ALL ON public.housekeeping_exceptions TO service_role;

DROP TRIGGER IF EXISTS housekeeping_exceptions_updated_at ON public.housekeeping_exceptions;
CREATE TRIGGER housekeeping_exceptions_updated_at
BEFORE UPDATE ON public.housekeeping_exceptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.housekeeping_report_exception(
  _room_state_id uuid,
  _task_id uuid,
  _exception_type text,
  _title text,
  _notes text DEFAULT NULL,
  _severity integer DEFAULT 2,
  _evidence jsonb DEFAULT '[]'::jsonb
)
RETURNS public.housekeeping_exceptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _row public.housekeeping_exceptions%ROWTYPE; _task public.ops_tasks%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
  IF _exception_type NOT IN ('dnd','discrepancy','damage','maintenance','lost_found','linen_amenity')
    THEN RAISE EXCEPTION 'Invalid housekeeping exception type'; END IF;
  IF _severity NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid severity'; END IF;
  IF jsonb_typeof(COALESCE(_evidence,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Evidence must be an array'; END IF;

  IF _task_id IS NOT NULL THEN
    SELECT * INTO _task FROM public.ops_tasks WHERE id = _task_id AND category = 'housekeeping';
    IF NOT FOUND THEN RAISE EXCEPTION 'Housekeeping task not found'; END IF;
  END IF;

  INSERT INTO public.housekeeping_exceptions (
    room_state_id, task_id, exception_type, title, notes, severity, evidence, reported_by
  ) VALUES (
    _room_state_id, _task_id, _exception_type, trim(_title),
    NULLIF(trim(COALESCE(_notes,'')), ''), _severity, _evidence, _uid
  ) RETURNING * INTO _row;

  IF _exception_type = 'maintenance' THEN
    INSERT INTO public.ops_tasks (
      booking_id, task_type, category, title, description, priority, due_at, room_state_id
    )
    SELECT _task.booking_id, 'housekeeping_maintenance', 'maintenance',
           'Maintenance: ' || trim(_title),
           concat_ws(E'\n', NULLIF(trim(COALESCE(_notes,'')), ''), 'Reported from Housekeeping.'),
           _severity, now() + CASE WHEN _severity = 1 THEN interval '30 minutes' ELSE interval '2 hours' END,
           _room_state_id
    WHERE _task_id IS NOT NULL;
  END IF;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_list_exceptions(
  _room_state_id uuid DEFAULT NULL,
  _open_only boolean DEFAULT true
)
RETURNS TABLE (
  id uuid, room_state_id uuid, task_id uuid, exception_type text, status text,
  severity integer, title text, notes text, evidence jsonb, reported_by uuid,
  assigned_to uuid, resolved_by uuid, resolved_at timestamptz, created_at timestamptz,
  unit_label text, room_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;

  RETURN QUERY
  SELECT e.id,e.room_state_id,e.task_id,e.exception_type,e.status,e.severity,e.title,e.notes,e.evidence,
         e.reported_by,e.assigned_to,e.resolved_by,e.resolved_at,e.created_at,rs.unit_label,r.name
  FROM public.housekeeping_exceptions e
  JOIN public.room_states rs ON rs.id=e.room_state_id
  JOIN public.rooms r ON r.id=rs.room_id
  WHERE (_room_state_id IS NULL OR e.room_state_id=_room_state_id)
    AND (NOT _open_only OR e.status='open')
  ORDER BY e.severity, e.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_resolve_exception(
  _exception_id uuid,
  _resolution text DEFAULT NULL
)
RETURNS public.housekeeping_exceptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _row public.housekeeping_exceptions%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
    THEN RAISE EXCEPTION 'Housekeeping access required'; END IF;
  SELECT * INTO _row FROM public.housekeeping_exceptions WHERE id=_exception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exception not found'; END IF;
  IF _row.status <> 'open' THEN RETURN _row; END IF;

  UPDATE public.housekeeping_exceptions
  SET status='resolved',
      notes=CASE WHEN NULLIF(trim(COALESCE(_resolution,'')),'') IS NULL THEN notes
                 ELSE concat_ws(E'\n',NULLIF(notes,''),'Resolution: '||trim(_resolution)) END,
      resolved_by=_uid,resolved_at=now(),updated_at=now()
  WHERE id=_exception_id RETURNING * INTO _row;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_report_exception(uuid,uuid,text,text,text,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.housekeeping_list_exceptions(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.housekeeping_resolve_exception(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.housekeeping_report_exception(uuid,uuid,text,text,text,integer,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_list_exceptions(uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_resolve_exception(uuid,text) TO authenticated,service_role;

COMMENT ON TABLE public.housekeeping_exceptions IS 'Housekeeping exception workflow for DND, discrepancies, damage, maintenance escalation, lost & found, and linen/amenity issues.';
