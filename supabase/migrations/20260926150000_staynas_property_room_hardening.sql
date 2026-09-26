-- StayNas Property / Room architecture hardening
-- Establishes the canonical hierarchy:
-- Organisation -> Property -> Room Category -> Room Type -> Physical Room Unit.
-- This is the security boundary for the next Reservation / Front Desk phases.

-- ---------------------------------------------------------------------------
-- 1. Canonical organisation/property model.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staynas_organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staynas_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('active','setup','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, slug),
  UNIQUE (organisation_id, code)
);

CREATE TABLE IF NOT EXISTS public.staynas_property_members (
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS staynas_property_members_user_idx
  ON public.staynas_property_members(user_id, property_id);

CREATE TABLE IF NOT EXISTS public.staynas_user_property_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staynas_organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_property_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_user_property_context ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_organisations FROM anon, authenticated;
REVOKE ALL ON public.staynas_properties FROM anon, authenticated;
REVOKE ALL ON public.staynas_property_members FROM anon, authenticated;
REVOKE ALL ON public.staynas_user_property_context FROM anon, authenticated;

GRANT SELECT ON public.staynas_organisations TO authenticated;
GRANT SELECT ON public.staynas_properties TO authenticated;
GRANT SELECT ON public.staynas_property_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_user_property_context TO authenticated;
GRANT ALL ON public.staynas_organisations, public.staynas_properties, public.staynas_property_members, public.staynas_user_property_context TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Seed the canonical default organisation/property for the existing
-- single-property installation, then establish membership for current staff.
-- ---------------------------------------------------------------------------
INSERT INTO public.staynas_organisations(slug, name)
VALUES ('staynas-demo', 'StayNas Demo Organisation')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.staynas_properties(organisation_id, slug, code, name, timezone, currency, status)
SELECT id, 'staynas-demo-property', 'DEMO', 'StayNas Demo Property', 'Africa/Dar_es_Salaam', 'USD', 'active'
FROM public.staynas_organisations
WHERE slug = 'staynas-demo'
ON CONFLICT (organisation_id, slug) DO NOTHING;

INSERT INTO public.staynas_property_members(property_id, user_id, role)
SELECT p.id, ur.user_id, ur.role
FROM public.staynas_properties p
JOIN public.user_roles ur ON true
WHERE p.slug = 'staynas-demo-property'
  AND ur.role IN ('owner','manager','reception','housekeeping','finance','admin','reservations','editor','marketing')
ON CONFLICT DO NOTHING;

INSERT INTO public.staynas_user_property_context(user_id, property_id)
SELECT DISTINCT pm.user_id, pm.property_id
FROM public.staynas_property_members pm
WHERE NOT EXISTS (
  SELECT 1 FROM public.staynas_user_property_context c WHERE c.user_id = pm.user_id
)
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.staynas_user_has_property_access(
  _uid uuid,
  _property_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_property_members pm
    WHERE pm.user_id = _uid
      AND pm.property_id = _property_id
      AND pm.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.staynas_active_property_id(_uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT c.property_id
      FROM public.staynas_user_property_context c
      WHERE c.user_id = _uid
        AND public.staynas_user_has_property_access(_uid, c.property_id)
      LIMIT 1
    ),
    (
      SELECT pm.property_id
      FROM public.staynas_property_members pm
      JOIN public.staynas_properties p ON p.id = pm.property_id
      WHERE pm.user_id = _uid
        AND pm.status = 'active'
        AND p.status = 'active'
      ORDER BY p.created_at, p.id
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.staynas_set_active_property(_property_id uuid)
RETURNS public.staynas_user_property_context
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.staynas_user_property_context%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.staynas_user_has_property_access(_uid, _property_id)
    THEN RAISE EXCEPTION 'Property access denied'; END IF;

  INSERT INTO public.staynas_user_property_context(user_id, property_id, updated_at)
  VALUES (_uid, _property_id, now())
  ON CONFLICT (user_id) DO UPDATE
  SET property_id = EXCLUDED.property_id, updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_list_properties()
RETURNS TABLE (
  id uuid,
  organisation_id uuid,
  organisation_name text,
  name text,
  code text,
  slug text,
  timezone text,
  currency text,
  status text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.organisation_id, o.name, p.name, p.code, p.slug,
         p.timezone, p.currency, p.status,
         p.id = public.staynas_active_property_id(auth.uid())
  FROM public.staynas_properties p
  JOIN public.staynas_organisations o ON o.id = p.organisation_id
  WHERE public.staynas_user_has_property_access(auth.uid(), p.id)
  ORDER BY p.name
$$;

REVOKE ALL ON FUNCTION public.staynas_user_has_property_access(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_active_property_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_set_active_property(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_list_properties() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_set_active_property(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_list_properties() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Property-scoped canonical room hierarchy.
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_categories
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.extras
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.room_states
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;

UPDATE public.room_categories
SET property_id = (SELECT id FROM public.staynas_properties WHERE slug = 'staynas-demo-property')
WHERE property_id IS NULL;

UPDATE public.rooms
SET property_id = (SELECT id FROM public.staynas_properties WHERE slug = 'staynas-demo-property')
WHERE property_id IS NULL;

UPDATE public.extras
SET property_id = (SELECT id FROM public.staynas_properties WHERE slug = 'staynas-demo-property')
WHERE property_id IS NULL;

UPDATE public.room_states rs
SET property_id = r.property_id
FROM public.rooms r
WHERE rs.room_id = r.id
  AND rs.property_id IS NULL;

UPDATE public.bookings b
SET property_id = r.property_id
FROM public.rooms r
WHERE b.room_id = r.id
  AND b.property_id IS NULL;

ALTER TABLE public.room_categories ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.rooms ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.extras ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.room_states ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN property_id SET NOT NULL;

DROP INDEX IF EXISTS rooms_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS rooms_property_slug_uidx
  ON public.rooms(property_id, slug);

DROP INDEX IF EXISTS room_categories_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS room_categories_property_slug_uidx
  ON public.room_categories(property_id, slug);

DROP INDEX IF EXISTS extras_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS extras_property_slug_uidx
  ON public.extras(property_id, slug);

CREATE INDEX IF NOT EXISTS rooms_property_sort_idx
  ON public.rooms(property_id, status, sort_order, name);
CREATE INDEX IF NOT EXISTS room_categories_property_sort_idx
  ON public.room_categories(property_id, status, sort_order, name);
CREATE INDEX IF NOT EXISTS room_states_property_idx
  ON public.room_states(property_id, state, room_id);
CREATE INDEX IF NOT EXISTS bookings_property_dates_idx
  ON public.bookings(property_id, check_in, check_out, status);

-- ---------------------------------------------------------------------------
-- 4. Enforce cross-table property consistency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staynas_enforce_room_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room_property uuid;
  _category_property uuid;
BEGIN
  SELECT property_id INTO _room_property FROM public.rooms WHERE id = NEW.room_id;
  IF _room_property IS NULL THEN RAISE EXCEPTION 'Room property is required'; END IF;

  IF NEW.property_id IS NULL THEN NEW.property_id := _room_property; END IF;
  IF NEW.property_id <> _room_property THEN
    RAISE EXCEPTION 'Room unit belongs to another property';
  END IF;

  IF TG_TABLE_NAME = 'rooms' AND NEW.category_id IS NOT NULL THEN
    SELECT property_id INTO _category_property FROM public.room_categories WHERE id = NEW.category_id;
    IF _category_property IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'Room category belongs to another property';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_enforce_booking_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _room_property uuid;
BEGIN
  SELECT property_id INTO _room_property FROM public.rooms WHERE id = NEW.room_id;
  IF _room_property IS NULL THEN RAISE EXCEPTION 'Room property is required'; END IF;
  IF NEW.property_id IS NULL THEN NEW.property_id := _room_property; END IF;
  IF NEW.property_id <> _room_property THEN
    RAISE EXCEPTION 'Booking property does not match room property';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_room_states_property_trg ON public.room_states;
CREATE TRIGGER staynas_room_states_property_trg
BEFORE INSERT OR UPDATE OF room_id, property_id ON public.room_states
FOR EACH ROW EXECUTE FUNCTION public.staynas_enforce_room_property();

DROP TRIGGER IF EXISTS staynas_rooms_category_property_trg ON public.rooms;
CREATE TRIGGER staynas_rooms_category_property_trg
BEFORE INSERT OR UPDATE OF property_id, category_id ON public.rooms
FOR EACH ROW
WHEN (NEW.category_id IS NOT NULL)
EXECUTE FUNCTION public.staynas_enforce_room_property();

DROP TRIGGER IF EXISTS staynas_bookings_property_trg ON public.bookings;
CREATE TRIGGER staynas_bookings_property_trg
BEFORE INSERT OR UPDATE OF room_id, property_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.staynas_enforce_booking_property();

-- ---------------------------------------------------------------------------
-- 5. Property-aware RLS for the canonical room/reservation boundary.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Room admins manage categories" ON public.room_categories;
CREATE POLICY "Room admins manage own property categories"
  ON public.room_categories FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Public read active room categories" ON public.room_categories;
CREATE POLICY "Public read active room categories"
  ON public.room_categories FOR SELECT TO anon, authenticated
  USING (status = 'active' OR public.is_any_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage rooms" ON public.rooms;
CREATE POLICY "Staff manage own property rooms"
  ON public.rooms FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Public read active rooms" ON public.rooms;
CREATE POLICY "Public read active rooms"
  ON public.rooms FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Staff manage extras" ON public.extras;
CREATE POLICY "Staff manage own property extras"
  ON public.extras FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Public read active extras" ON public.extras;
CREATE POLICY "Public read active extras"
  ON public.extras FOR SELECT TO anon, authenticated
  USING (active);

DROP POLICY IF EXISTS "Staff read room_states" ON public.room_states;
DROP POLICY IF EXISTS "Supervisors insert room_states" ON public.room_states;
DROP POLICY IF EXISTS "Supervisors update room_states" ON public.room_states;
DROP POLICY IF EXISTS "Supervisors delete room_states" ON public.room_states;

CREATE POLICY "Staff read room_states"
  ON public.room_states FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "Supervisors insert room_states"
  ON public.room_states FOR INSERT TO authenticated
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

CREATE POLICY "Supervisors update room_states"
  ON public.room_states FOR UPDATE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.is_any_staff(auth.uid())
    AND NOT public.has_any_role(auth.uid(), ARRAY['housekeeping']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.is_any_staff(auth.uid())
    AND NOT public.has_any_role(auth.uid(), ARRAY['housekeeping']::public.app_role[])
  );

CREATE POLICY "Supervisors delete room_states"
  ON public.room_states FOR DELETE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

DROP POLICY IF EXISTS "Staff read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff manage bookings" ON public.bookings;
CREATE POLICY "Staff read own property bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "Staff manage own property bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id))
  WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS "Staff read booking nights" ON public.booking_nights;
CREATE POLICY "Staff read own property booking nights"
  ON public.booking_nights FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );

DROP POLICY IF EXISTS "Staff manage inventory" ON public.room_inventory;
CREATE POLICY "Staff manage own property inventory"
  ON public.room_inventory FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_id
        AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
        AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_id
        AND public.staynas_user_has_property_access(auth.uid(), r.property_id)
        AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Property-aware housekeeping access.
-- Existing housekeeping RPCs inherit property isolation through room_state_id.
-- Add explicit property indexes for the execution/readiness paths.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ops_tasks_housekeeping_property_idx
  ON public.ops_tasks(room_state_id, category, status, assignee_id)
  WHERE category = 'housekeeping';

COMMENT ON TABLE public.staynas_properties IS
'Canonical StayNas property boundary. All property-owned hospitality inventory and reservations scope through this entity.';

COMMENT ON TABLE public.rooms IS
'StayNas room type/category entity scoped to a canonical property. Physical units live in room_states.';

COMMENT ON TABLE public.room_states IS
'StayNas physical room unit inventory. Each unit belongs to exactly one property through its room.';

COMMENT ON TABLE public.bookings IS
'StayNas reservation entity with immutable property scope derived from its assigned room.';
