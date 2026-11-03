-- Restore tenant-safe Guest CRM and guest-profile access after the production RLS baseline.
-- Guest identity rows are global identities, but are visible only through bookings
-- belonging to a property the authenticated staff member can access. Guest-specific
-- notes, preferences, communications, documents and tag assignments are property scoped.

ALTER TABLE public.guest_notes
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_preferences
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_documents
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_communications
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_tag_assignments
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

-- Existing child records are assigned only when their owning property is unambiguous.
-- Ambiguous or orphaned records intentionally stop this migration rather than leak
-- historical guest information across tenants.
WITH guest_property AS (
  SELECT guest_id, min(property_id) AS property_id
  FROM public.bookings
  WHERE guest_id IS NOT NULL AND property_id IS NOT NULL
  GROUP BY guest_id
  HAVING count(DISTINCT property_id) = 1
)
UPDATE public.guest_notes n
SET property_id = gp.property_id
FROM guest_property gp
WHERE n.property_id IS NULL AND n.guest_id = gp.guest_id;

WITH guest_property AS (
  SELECT guest_id, min(property_id) AS property_id
  FROM public.bookings
  WHERE guest_id IS NOT NULL AND property_id IS NOT NULL
  GROUP BY guest_id
  HAVING count(DISTINCT property_id) = 1
)
UPDATE public.guest_preferences p
SET property_id = gp.property_id
FROM guest_property gp
WHERE p.property_id IS NULL AND p.guest_id = gp.guest_id;

WITH guest_property AS (
  SELECT guest_id, min(property_id) AS property_id
  FROM public.bookings
  WHERE guest_id IS NOT NULL AND property_id IS NOT NULL
  GROUP BY guest_id
  HAVING count(DISTINCT property_id) = 1
)
UPDATE public.guest_tag_assignments a
SET property_id = gp.property_id
FROM guest_property gp
WHERE a.property_id IS NULL AND a.guest_id = gp.guest_id;

WITH guest_property AS (
  SELECT guest_id, min(property_id) AS property_id
  FROM public.bookings
  WHERE guest_id IS NOT NULL AND property_id IS NOT NULL
  GROUP BY guest_id
  HAVING count(DISTINCT property_id) = 1
)
UPDATE public.guest_communications c
SET property_id = CASE
  WHEN c.booking_id IS NOT NULL THEN b.property_id
  ELSE gp.property_id
END
FROM guest_property gp
LEFT JOIN public.bookings b ON b.id = c.booking_id AND b.guest_id = c.guest_id
WHERE c.property_id IS NULL AND c.guest_id = gp.guest_id;

WITH guest_property AS (
  SELECT guest_id, min(property_id) AS property_id
  FROM public.bookings
  WHERE guest_id IS NOT NULL AND property_id IS NOT NULL
  GROUP BY guest_id
  HAVING count(DISTINCT property_id) = 1
)
UPDATE public.guest_documents d
SET property_id = CASE
  WHEN d.booking_id IS NOT NULL THEN b.property_id
  WHEN d.checkin_id IS NOT NULL THEN cb.property_id
  ELSE gp.property_id
END
FROM guest_property gp
LEFT JOIN public.bookings b ON b.id = d.booking_id AND b.guest_id = d.guest_id
LEFT JOIN public.guest_checkins gc ON gc.id = d.checkin_id AND gc.guest_id = d.guest_id
LEFT JOIN public.bookings cb ON cb.id = gc.booking_id
WHERE d.property_id IS NULL AND d.guest_id = gp.guest_id;

ALTER TABLE public.guest_notes ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.guest_preferences ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.guest_documents ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.guest_communications ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.guest_tag_assignments ALTER COLUMN property_id SET NOT NULL;

-- Allow the same guest/tag and guest/preference key to exist independently per property.
ALTER TABLE public.guest_tag_assignments
  DROP CONSTRAINT IF EXISTS guest_tag_assignments_pkey;
ALTER TABLE public.guest_tag_assignments
  ADD CONSTRAINT guest_tag_assignments_pkey PRIMARY KEY (guest_id, tag_id, property_id);

ALTER TABLE public.guest_preferences
  DROP CONSTRAINT IF EXISTS guest_preferences_guest_id_key_key;
ALTER TABLE public.guest_preferences
  ADD CONSTRAINT guest_preferences_guest_property_key_key UNIQUE (guest_id, property_id, key);

-- Definer helper avoids recursive RLS evaluation while checking whether a guest
-- has at least one booking in a property the caller is actively entitled to access.
CREATE OR REPLACE FUNCTION public.staynas_guest_is_accessible(_uid uuid, _guest_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL
    AND _guest_id IS NOT NULL
    AND public.is_any_staff(_uid)
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.guest_id = _guest_id
        AND b.property_id IS NOT NULL
        AND public.staynas_user_has_property_access(_uid, b.property_id)
    )
$$;

REVOKE ALL ON FUNCTION public.staynas_guest_is_accessible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_guest_is_accessible(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_any_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_user_has_property_access(uuid, uuid) TO authenticated, service_role;

-- All new child rows inherit the active property unless a booking/check-in
-- explicitly determines the property. The guest must belong to that property.
CREATE OR REPLACE FUNCTION public.staynas_set_guest_child_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row jsonb := to_jsonb(NEW);
  _uid uuid := auth.uid();
  _guest_id uuid;
  _booking_id uuid;
  _checkin_id uuid;
  _property_id uuid;
  _derived_property_id uuid;
  _checkin_booking_id uuid;
  _checkin_guest_id uuid;
BEGIN
  _guest_id := NULLIF(_row ->> 'guest_id', '')::uuid;
  _booking_id := NULLIF(_row ->> 'booking_id', '')::uuid;
  _checkin_id := NULLIF(_row ->> 'checkin_id', '')::uuid;
  _property_id := NULLIF(_row ->> 'property_id', '')::uuid;

  IF _booking_id IS NOT NULL THEN
    SELECT b.property_id INTO _derived_property_id
    FROM public.bookings b
    WHERE b.id = _booking_id
      AND (_guest_id IS NULL OR b.guest_id = _guest_id);
    IF _derived_property_id IS NULL THEN
      RAISE EXCEPTION 'Guest record booking does not match the guest';
    END IF;
    IF _property_id IS NOT NULL AND _property_id <> _derived_property_id THEN
      RAISE EXCEPTION 'Guest record cannot be moved across properties';
    END IF;
    _property_id := _derived_property_id;
  END IF;

  IF _checkin_id IS NOT NULL THEN
    SELECT b.property_id, gc.booking_id, gc.guest_id
      INTO _derived_property_id, _checkin_booking_id, _checkin_guest_id
    FROM public.guest_checkins gc
    JOIN public.bookings b ON b.id = gc.booking_id
    WHERE gc.id = _checkin_id;
    IF _derived_property_id IS NULL
       OR (_guest_id IS NOT NULL AND _checkin_guest_id <> _guest_id)
       OR (_booking_id IS NOT NULL AND _checkin_booking_id <> _booking_id) THEN
      RAISE EXCEPTION 'Guest record check-in does not match the guest booking';
    END IF;
    IF _property_id IS NOT NULL AND _property_id <> _derived_property_id THEN
      RAISE EXCEPTION 'Guest record cannot be moved across properties';
    END IF;
    _property_id := _derived_property_id;
  END IF;

  IF _property_id IS NULL THEN
    _property_id := public.staynas_active_property_id(_uid);
  END IF;

  IF _uid IS NULL
     OR NOT public.is_any_staff(_uid)
     OR _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(_uid, _property_id) THEN
    RAISE EXCEPTION 'Active property staff access required for guest records';
  END IF;

  IF _guest_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.guest_id = _guest_id AND b.property_id = _property_id
  ) THEN
    RAISE EXCEPTION 'Guest is not associated with the selected property';
  END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object('property_id', _property_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guest_notes_property_scope_trg ON public.guest_notes;
CREATE TRIGGER guest_notes_property_scope_trg
BEFORE INSERT OR UPDATE OF property_id, guest_id ON public.guest_notes
FOR EACH ROW EXECUTE FUNCTION public.staynas_set_guest_child_property();

DROP TRIGGER IF EXISTS guest_preferences_property_scope_trg ON public.guest_preferences;
CREATE TRIGGER guest_preferences_property_scope_trg
BEFORE INSERT OR UPDATE OF property_id, guest_id ON public.guest_preferences
FOR EACH ROW EXECUTE FUNCTION public.staynas_set_guest_child_property();

DROP TRIGGER IF EXISTS guest_documents_property_scope_trg ON public.guest_documents;
CREATE TRIGGER guest_documents_property_scope_trg
BEFORE INSERT OR UPDATE OF property_id, guest_id, booking_id, checkin_id ON public.guest_documents
FOR EACH ROW EXECUTE FUNCTION public.staynas_set_guest_child_property();

DROP TRIGGER IF EXISTS guest_communications_property_scope_trg ON public.guest_communications;
CREATE TRIGGER guest_communications_property_scope_trg
BEFORE INSERT OR UPDATE OF property_id, guest_id, booking_id ON public.guest_communications
FOR EACH ROW EXECUTE FUNCTION public.staynas_set_guest_child_property();

DROP TRIGGER IF EXISTS guest_tag_assignments_property_scope_trg ON public.guest_tag_assignments;
CREATE TRIGGER guest_tag_assignments_property_scope_trg
BEFORE INSERT OR UPDATE OF property_id, guest_id ON public.guest_tag_assignments
FOR EACH ROW EXECUTE FUNCTION public.staynas_set_guest_child_property();

-- Guest master identity is shared only with staff belonging to a property
-- that has a booking relationship with that guest.
DROP POLICY IF EXISTS guests_staff_all ON public.guests;
DROP POLICY IF EXISTS guests_property_staff_read ON public.guests;
DROP POLICY IF EXISTS guests_property_staff_update ON public.guests;
CREATE POLICY guests_property_staff_read
ON public.guests FOR SELECT TO authenticated
USING (public.staynas_guest_is_accessible(auth.uid(), id));
CREATE POLICY guests_property_staff_update
ON public.guests FOR UPDATE TO authenticated
USING (public.staynas_guest_is_accessible(auth.uid(), id))
WITH CHECK (public.staynas_guest_is_accessible(auth.uid(), id));

-- Property-scoped guest profile records.
DROP POLICY IF EXISTS guest_notes_staff_all ON public.guest_notes;
DROP POLICY IF EXISTS guest_notes_property_staff_all ON public.guest_notes;
CREATE POLICY guest_notes_property_staff_all
ON public.guest_notes FOR ALL TO authenticated
USING (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id))
WITH CHECK (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS guest_preferences_property_staff_all ON public.guest_preferences;
CREATE POLICY guest_preferences_property_staff_all
ON public.guest_preferences FOR ALL TO authenticated
USING (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id))
WITH CHECK (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS guest_documents_property_staff_read ON public.guest_documents;
CREATE POLICY guest_documents_property_staff_read
ON public.guest_documents FOR SELECT TO authenticated
USING (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS guest_comms_staff_all ON public.guest_communications;
DROP POLICY IF EXISTS guest_communications_property_staff_all ON public.guest_communications;
CREATE POLICY guest_communications_property_staff_all
ON public.guest_communications FOR ALL TO authenticated
USING (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id))
WITH CHECK (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS guest_tag_assign_staff_all ON public.guest_tag_assignments;
DROP POLICY IF EXISTS guest_tag_assignments_property_staff_all ON public.guest_tag_assignments;
CREATE POLICY guest_tag_assignments_property_staff_all
ON public.guest_tag_assignments FOR ALL TO authenticated
USING (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id))
WITH CHECK (public.is_any_staff(auth.uid()) AND public.staynas_user_has_property_access(auth.uid(), property_id));

-- Guest tags are a shared, non-personal taxonomy; assignments remain property scoped.
DROP POLICY IF EXISTS guest_tags_staff_all ON public.guest_tags;
DROP POLICY IF EXISTS guest_tags_staff_catalog_all ON public.guest_tags;
CREATE POLICY guest_tags_staff_catalog_all
ON public.guest_tags FOR ALL TO authenticated
USING (public.is_any_staff(auth.uid()))
WITH CHECK (public.is_any_staff(auth.uid()));

-- Booking-linked guest check-in and timeline records.
ALTER TABLE public.guest_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_checkin_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_checkins_property_staff_read ON public.guest_checkins;
CREATE POLICY guest_checkins_property_staff_read
ON public.guest_checkins FOR SELECT TO authenticated
USING (
  public.is_any_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = guest_checkins.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  )
);

DROP POLICY IF EXISTS guest_checkin_activity_property_staff_read ON public.guest_checkin_activity;
CREATE POLICY guest_checkin_activity_property_staff_read
ON public.guest_checkin_activity FOR SELECT TO authenticated
USING (
  public.is_any_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = guest_checkin_activity.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  )
);

DROP POLICY IF EXISTS guest_threads_property_staff_read ON public.guest_threads;
CREATE POLICY guest_threads_property_staff_read
ON public.guest_threads FOR SELECT TO authenticated
USING (
  public.is_any_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = guest_threads.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  )
);

-- Guest timeline events inherit their property's booking boundary.
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_events_property_staff_read ON public.email_events;
CREATE POLICY email_events_property_staff_read
ON public.email_events FOR SELECT TO authenticated
USING (
  public.is_any_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = email_events.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  )
);

DROP POLICY IF EXISTS whatsapp_alerts_property_staff_read ON public.whatsapp_alerts;
CREATE POLICY whatsapp_alerts_property_staff_read
ON public.whatsapp_alerts FOR SELECT TO authenticated
USING (
  public.is_any_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = whatsapp_alerts.booking_id
      AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
  )
);

-- Restore only the grants required by the CRM/profile read and write paths.
GRANT SELECT, UPDATE ON public.guests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.guest_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_preferences TO authenticated;
GRANT SELECT ON public.guest_documents TO authenticated;
GRANT SELECT, INSERT ON public.guest_communications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_tag_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_tags TO authenticated;
GRANT SELECT ON public.guest_checkins, public.guest_checkin_activity, public.guest_threads TO authenticated;
GRANT SELECT ON public.guest_directory, public.guest_metrics, public.guest_country_stats TO authenticated;
GRANT SELECT ON public.bookings, public.booking_extras, public.extras TO authenticated;
GRANT SELECT ON public.email_events, public.whatsapp_alerts TO authenticated;

-- The duplicate finder is SECURITY DEFINER, so explicitly restrict its result set
-- to guests the caller can already access.
CREATE OR REPLACE FUNCTION public.find_duplicate_guests()
RETURNS TABLE(cluster_key text, match_type text, guest_ids uuid[], sample_names text[], sample_emails text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH accessible_guests AS (
    SELECT g.*
    FROM public.guests g
    WHERE g.is_deleted = false
      AND public.staynas_guest_is_accessible(auth.uid(), g.id)
  )
  SELECT phone_e164::text, 'phone'::text,
         array_agg(id), array_agg(full_name), array_agg(email::text)
  FROM accessible_guests
  WHERE phone_e164 IS NOT NULL
  GROUP BY phone_e164
  HAVING COUNT(*) > 1
  UNION ALL
  SELECT extensions.soundex(full_name) || ':' || COALESCE(country,''),
         'name_country'::text,
         array_agg(id), array_agg(full_name), array_agg(email::text)
  FROM accessible_guests
  WHERE length(full_name) > 2
  GROUP BY extensions.soundex(full_name) || ':' || COALESCE(country,'')
  HAVING COUNT(*) > 1
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_guests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_guests() TO authenticated, service_role;

COMMENT ON COLUMN public.guest_notes.property_id IS 'Owning StayNas property; enforces tenant isolation for guest notes.';
COMMENT ON COLUMN public.guest_preferences.property_id IS 'Owning StayNas property; preferences are property scoped.';
COMMENT ON COLUMN public.guest_documents.property_id IS 'Owning StayNas property; enforces tenant isolation for guest documents.';
COMMENT ON COLUMN public.guest_communications.property_id IS 'Owning StayNas property; communications are property scoped.';
COMMENT ON COLUMN public.guest_tag_assignments.property_id IS 'Owning StayNas property; tag assignments are property scoped.';
