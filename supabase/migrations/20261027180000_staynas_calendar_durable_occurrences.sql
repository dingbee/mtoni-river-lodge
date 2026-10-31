-- P3 completion: persist generated occurrences so downstream automation can reference stable event IDs.
-- Idempotent and property-scoped. This migration is additive; do not apply to production before preview acceptance.

CREATE TABLE IF NOT EXISTS public.staynas_calendar_schedule_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.staynas_calendar_schedule_series(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled','cancelled')),
  exception_id uuid REFERENCES public.staynas_calendar_schedule_exceptions(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, occurrence_date),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS staynas_calendar_occurrences_property_time_idx
  ON public.staynas_calendar_schedule_occurrences(property_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS staynas_calendar_occurrences_staff_time_idx
  ON public.staynas_calendar_schedule_occurrences(staff_user_id, starts_at);

ALTER TABLE public.staynas_calendar_schedule_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_calendar_schedule_occurrences FROM anon, authenticated;
GRANT SELECT ON public.staynas_calendar_schedule_occurrences TO authenticated;
GRANT ALL ON public.staynas_calendar_schedule_occurrences TO service_role;

DROP POLICY IF EXISTS "Calendar occurrences read accessible" ON public.staynas_calendar_schedule_occurrences;
CREATE POLICY "Calendar occurrences read accessible"
  ON public.staynas_calendar_schedule_occurrences
  FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND (
      staff_user_id = auth.uid()
      OR public.staynas_calendar_has_property_role(auth.uid(), property_id, ARRAY['owner','manager','admin']::public.app_role[])
    )
  );

CREATE OR REPLACE FUNCTION public.staynas_calendar_materialize_occurrences(
  _property_id uuid,
  _from date,
  _to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL
     OR NOT public.staynas_user_has_property_access(v_uid, _property_id)
     OR NOT public.staynas_calendar_has_property_role(v_uid, _property_id, ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Calendar manager access required';
  END IF;
  IF _to <= _from OR (_to - _from) > 93 THEN
    RAISE EXCEPTION 'Invalid calendar range';
  END IF;

  WITH candidate AS (
    SELECT
      s.property_id,
      s.id AS series_id,
      s.staff_user_id,
      s.title AS series_title,
      s.notes AS series_notes,
      s.timezone,
      d::date AS occurrence_date,
      e.id AS exception_id,
      e.exception_type,
      e.title AS exception_title,
      e.notes AS exception_notes,
      e.starts_at AS override_start,
      e.ends_at AS override_end,
      s.local_start,
      s.local_end
    FROM public.staynas_calendar_schedule_series s
    CROSS JOIN LATERAL generate_series(
      GREATEST(s.starts_on, _from)::timestamp,
      LEAST(COALESCE(s.ends_on, _to - 1), _to - 1)::timestamp,
      interval '1 day'
    ) d
    LEFT JOIN public.staynas_calendar_schedule_exceptions e
      ON e.series_id = s.id AND e.occurrence_date = d::date
    WHERE s.property_id = _property_id
      AND s.status = 'active'
      AND s.starts_on < _to
      AND COALESCE(s.ends_on, _to - 1) >= _from
      AND public.staynas_user_has_property_access(s.staff_user_id, _property_id)
      AND (
        (s.frequency = 'daily' AND mod((d::date - s.starts_on), s.interval_count) = 0)
        OR
        (s.frequency = 'weekly'
          AND mod(floor(((d::date - (s.starts_on - ((extract(dow FROM s.starts_on)::integer + 6) % 7)))::numeric) / 7)::integer, s.interval_count) = 0
          AND extract(dow FROM d)::smallint = ANY(s.days_of_week))
      )
  ), upserted AS (
    INSERT INTO public.staynas_calendar_schedule_occurrences (
      property_id, series_id, occurrence_date, staff_user_id, title, notes,
      starts_at, ends_at, status, exception_id, generated_at
    )
    SELECT
      c.property_id, c.series_id, c.occurrence_date, c.staff_user_id,
      COALESCE(c.exception_title, c.series_title),
      COALESCE(c.exception_notes, c.series_notes),
      CASE WHEN c.exception_type = 'override' THEN c.override_start
           ELSE (c.occurrence_date + c.local_start) AT TIME ZONE c.timezone END,
      CASE WHEN c.exception_type = 'override' THEN c.override_end
           ELSE (c.occurrence_date + c.local_end) AT TIME ZONE c.timezone END,
      CASE WHEN c.exception_type = 'cancelled' THEN 'cancelled' ELSE 'scheduled' END,
      c.exception_id,
      now()
    FROM candidate c
    ON CONFLICT (series_id, occurrence_date) DO UPDATE SET
      property_id = EXCLUDED.property_id,
      staff_user_id = EXCLUDED.staff_user_id,
      title = EXCLUDED.title,
      notes = EXCLUDED.notes,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status,
      exception_id = EXCLUDED.exception_id,
      generated_at = now(),
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM upserted;

  -- Cancel previously materialized occurrences when their parent series is paused/cancelled.
  UPDATE public.staynas_calendar_schedule_occurrences o
    SET status = 'cancelled', generated_at = now(), updated_at = now()
  FROM public.staynas_calendar_schedule_series s
  WHERE o.series_id = s.id
    AND o.property_id = _property_id
    AND o.occurrence_date >= _from AND o.occurrence_date < _to
    AND s.status IN ('paused','cancelled')
    AND o.status <> 'cancelled';

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_materialize_occurrences(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_materialize_occurrences(uuid,date,date) TO authenticated;

DROP TRIGGER IF EXISTS staynas_calendar_occurrences_updated_at ON public.staynas_calendar_schedule_occurrences;
CREATE TRIGGER staynas_calendar_occurrences_updated_at
  BEFORE UPDATE ON public.staynas_calendar_schedule_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
