-- StayNas Phase 3 foundation: recurring schedules, exceptions, property rules, idempotent notifications and audit.
-- Additive only. Deploy through preview and acceptance before applying to production.

CREATE TABLE IF NOT EXISTS public.staynas_calendar_schedule_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  notes text,
  timezone text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  local_start time NOT NULL,
  local_end time NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 12),
  days_of_week smallint[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_calendar_series_valid_range CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT staynas_calendar_series_valid_time CHECK (local_end > local_start),
  CONSTRAINT staynas_calendar_series_weekdays CHECK (
    (frequency = 'daily' AND cardinality(days_of_week) = 0)
    OR
    (frequency = 'weekly' AND cardinality(days_of_week) BETWEEN 1 AND 7
      AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
  )
);

CREATE INDEX IF NOT EXISTS staynas_calendar_series_property_dates_idx
  ON public.staynas_calendar_schedule_series(property_id, starts_on, ends_on)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS staynas_calendar_series_staff_idx
  ON public.staynas_calendar_schedule_series(staff_user_id, starts_on)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.staynas_calendar_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.staynas_calendar_schedule_series(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  exception_type text NOT NULL CHECK (exception_type IN ('cancelled','override')),
  title text,
  notes text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, occurrence_date),
  CONSTRAINT staynas_calendar_exception_override_range CHECK (
    (exception_type = 'cancelled' AND starts_at IS NULL AND ends_at IS NULL)
    OR (exception_type = 'override' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  )
);

CREATE TABLE IF NOT EXISTS public.staynas_calendar_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  rule_key text NOT NULL CHECK (rule_key IN (
    'booking_lead_time','blackout_windows','staff_conflict_policy',
    'maintenance_buffer_minutes','housekeeping_turnaround_minutes','notification_preferences'
  )),
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, rule_key)
);

CREATE TABLE IF NOT EXISTS public.staynas_calendar_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  event_key text NOT NULL CHECK (length(trim(event_key)) BETWEEN 8 AND 240),
  event_type text NOT NULL CHECK (length(trim(event_type)) BETWEEN 2 AND 100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','cancelled')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staynas_calendar_outbox_idempotency_idx
  ON public.staynas_calendar_notification_outbox(property_id, event_key, COALESCE(recipient_id, '00000000-0000-0000-0000-000000000000'::uuid), channel);
CREATE INDEX IF NOT EXISTS staynas_calendar_outbox_due_idx
  ON public.staynas_calendar_notification_outbox(status, scheduled_for)
  WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS staynas_calendar_outbox_property_created_idx
  ON public.staynas_calendar_notification_outbox(property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_calendar_rule_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('rule','schedule_series','schedule_exception')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staynas_calendar_rule_audit_property_created_idx
  ON public.staynas_calendar_rule_audit(property_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staynas_calendar_schedule_series',
    'staynas_calendar_schedule_exceptions',
    'staynas_calendar_rules',
    'staynas_calendar_notification_outbox',
    'staynas_calendar_rule_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Calendar series read accessible" ON public.staynas_calendar_schedule_series;
CREATE POLICY "Calendar series read accessible" ON public.staynas_calendar_schedule_series
  FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND (staff_user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  );
DROP POLICY IF EXISTS "Calendar managers manage series" ON public.staynas_calendar_schedule_series;
CREATE POLICY "Calendar managers manage series" ON public.staynas_calendar_schedule_series
  FOR ALL TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    AND public.staynas_user_has_property_access(staff_user_id, property_id));

DROP POLICY IF EXISTS "Calendar exceptions read accessible" ON public.staynas_calendar_schedule_exceptions;
CREATE POLICY "Calendar exceptions read accessible" ON public.staynas_calendar_schedule_exceptions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staynas_calendar_schedule_series s
    WHERE s.id = series_id AND public.staynas_user_has_property_access(auth.uid(), s.property_id)
      AND (s.staff_user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  ));
DROP POLICY IF EXISTS "Calendar managers manage exceptions" ON public.staynas_calendar_schedule_exceptions;
CREATE POLICY "Calendar managers manage exceptions" ON public.staynas_calendar_schedule_exceptions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staynas_calendar_schedule_series s
    WHERE s.id = series_id AND public.staynas_user_has_property_access(auth.uid(), s.property_id)
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staynas_calendar_schedule_series s
    WHERE s.id = series_id AND public.staynas_user_has_property_access(auth.uid(), s.property_id)
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  ));

DROP POLICY IF EXISTS "Calendar rules read accessible" ON public.staynas_calendar_rules;
CREATE POLICY "Calendar rules read accessible" ON public.staynas_calendar_rules
  FOR SELECT TO authenticated USING (public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS "Calendar managers manage rules" ON public.staynas_calendar_rules;
CREATE POLICY "Calendar managers manage rules" ON public.staynas_calendar_rules
  FOR ALL TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Calendar notifications read own" ON public.staynas_calendar_notification_outbox;
CREATE POLICY "Calendar notifications read own" ON public.staynas_calendar_notification_outbox
  FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND (recipient_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])));
DROP POLICY IF EXISTS "Calendar managers queue notifications" ON public.staynas_calendar_notification_outbox;
CREATE POLICY "Calendar managers queue notifications" ON public.staynas_calendar_notification_outbox
  FOR INSERT TO authenticated
  WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
-- Authenticated users cannot mutate delivery state directly. Service role owns processing.
DROP POLICY IF EXISTS "Calendar managers update notifications" ON public.staynas_calendar_notification_outbox;
CREATE POLICY "Calendar managers update notifications" ON public.staynas_calendar_notification_outbox
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Calendar audit read managers" ON public.staynas_calendar_rule_audit;
CREATE POLICY "Calendar audit read managers" ON public.staynas_calendar_rule_audit
  FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.staynas_calendar_audit_phase3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property_id uuid;
  v_entity_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'staynas_calendar_schedule_exceptions' THEN
    SELECT s.property_id INTO v_property_id FROM public.staynas_calendar_schedule_series s WHERE s.id = COALESCE(NEW.series_id, OLD.series_id);
    v_entity_id := COALESCE(NEW.id, OLD.id);
    -- Parent-series cascade deletes may remove the parent before this trigger runs.
    IF v_property_id IS NULL THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
  ELSE
    v_property_id := COALESCE(NEW.property_id, OLD.property_id);
    v_entity_id := COALESCE(NEW.id, OLD.id);
  END IF;
  INSERT INTO public.staynas_calendar_rule_audit(property_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (
    v_property_id, auth.uid(),
    CASE TG_TABLE_NAME
      WHEN 'staynas_calendar_rules' THEN 'rule'
      WHEN 'staynas_calendar_schedule_series' THEN 'schedule_series'
      ELSE 'schedule_exception'
    END,
    v_entity_id, lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS staynas_calendar_rules_audit ON public.staynas_calendar_rules;
CREATE TRIGGER staynas_calendar_rules_audit AFTER INSERT OR UPDATE OR DELETE ON public.staynas_calendar_rules
  FOR EACH ROW EXECUTE FUNCTION public.staynas_calendar_audit_phase3();
DROP TRIGGER IF EXISTS staynas_calendar_series_audit ON public.staynas_calendar_schedule_series;
CREATE TRIGGER staynas_calendar_series_audit AFTER INSERT OR UPDATE OR DELETE ON public.staynas_calendar_schedule_series
  FOR EACH ROW EXECUTE FUNCTION public.staynas_calendar_audit_phase3();
DROP TRIGGER IF EXISTS staynas_calendar_exceptions_audit ON public.staynas_calendar_schedule_exceptions;
CREATE TRIGGER staynas_calendar_exceptions_audit AFTER INSERT OR UPDATE OR DELETE ON public.staynas_calendar_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_calendar_audit_phase3();

CREATE OR REPLACE FUNCTION public.staynas_calendar_recurring_occurrences(
  _property_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  series_id uuid,
  occurrence_date date,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  staff_user_id uuid,
  notes text,
  exception_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_timezone text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(v_uid, ARRAY['owner','manager','admin','reception','housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Operations calendar access required';
  END IF;
  IF NOT public.staynas_user_has_property_access(v_uid, _property_id) THEN
    RAISE EXCEPTION 'Property access denied';
  END IF;
  IF _to <= _from OR (_to - _from) > 93 THEN
    RAISE EXCEPTION 'Invalid calendar range';
  END IF;
  SELECT p.timezone INTO v_timezone FROM public.staynas_properties p
    WHERE p.id = _property_id AND p.status = 'active';
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'Active property not found'; END IF;

  RETURN QUERY
  WITH dates AS (
    SELECT s.id, s.property_id, s.staff_user_id, s.title, s.notes, s.timezone,
      s.starts_on, s.local_start, s.local_end, s.frequency, s.interval_count,
      d::date AS occurrence_date
    FROM public.staynas_calendar_schedule_series s
    CROSS JOIN LATERAL generate_series(
      GREATEST(s.starts_on, _from)::timestamp,
      LEAST(COALESCE(s.ends_on, _to - 1), _to - 1)::timestamp,
      interval '1 day'
    ) d
    WHERE s.property_id = _property_id AND s.status = 'active'
      AND s.starts_on < _to AND COALESCE(s.ends_on, _to - 1) >= _from
      AND public.staynas_user_has_property_access(s.staff_user_id, _property_id)
      AND (s.staff_user_id = v_uid OR public.has_any_role(v_uid, ARRAY['owner','manager','admin']::public.app_role[]))
      AND (
        (s.frequency = 'daily' AND mod((d::date - s.starts_on), s.interval_count) = 0)
        OR
        (s.frequency = 'weekly'
          AND mod(floor(((d::date - s.starts_on)::numeric) / 7)::integer, s.interval_count) = 0
          AND extract(dow FROM d)::smallint = ANY(s.days_of_week))
      )
  )
  SELECT d.id, d.occurrence_date,
    COALESCE(e.title, d.title),
    COALESCE(e.starts_at, (d.occurrence_date + d.local_start) AT TIME ZONE d.timezone),
    COALESCE(e.ends_at, (d.occurrence_date + d.local_end) AT TIME ZONE d.timezone),
    CASE WHEN e.exception_type = 'cancelled' THEN 'cancelled' ELSE 'scheduled' END,
    d.staff_user_id, COALESCE(e.notes, d.notes), e.exception_type
  FROM dates d
  LEFT JOIN public.staynas_calendar_schedule_exceptions e
    ON e.series_id = d.id AND e.occurrence_date = d.occurrence_date
  WHERE e.exception_type IS DISTINCT FROM 'cancelled'
  ORDER BY 4;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_calendar_recurring_occurrences(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_calendar_recurring_occurrences(uuid,date,date) TO authenticated, service_role;

DROP TRIGGER IF EXISTS staynas_calendar_series_updated_at ON public.staynas_calendar_schedule_series;
CREATE TRIGGER staynas_calendar_series_updated_at BEFORE UPDATE ON public.staynas_calendar_schedule_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS staynas_calendar_exceptions_updated_at ON public.staynas_calendar_schedule_exceptions;
CREATE TRIGGER staynas_calendar_exceptions_updated_at BEFORE UPDATE ON public.staynas_calendar_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS staynas_calendar_rules_updated_at ON public.staynas_calendar_rules;
CREATE TRIGGER staynas_calendar_rules_updated_at BEFORE UPDATE ON public.staynas_calendar_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS staynas_calendar_outbox_updated_at ON public.staynas_calendar_notification_outbox;
CREATE TRIGGER staynas_calendar_outbox_updated_at BEFORE UPDATE ON public.staynas_calendar_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
