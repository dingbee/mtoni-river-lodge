-- Property/Room hardening follow-up: policy and trigger correctness.

-- Room-category validation for the rooms table has a different row shape from
-- physical room-state validation.
CREATE OR REPLACE FUNCTION public.staynas_validate_room_category_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _category_property uuid;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT property_id INTO _category_property
    FROM public.room_categories
    WHERE id = NEW.category_id;

    IF _category_property IS NULL THEN
      RAISE EXCEPTION 'Room category not found';
    END IF;
    IF _category_property <> NEW.property_id THEN
      RAISE EXCEPTION 'Room category belongs to another property';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_rooms_category_property_trg ON public.rooms;
CREATE TRIGGER staynas_rooms_category_property_trg
BEFORE INSERT OR UPDATE OF property_id, category_id ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.staynas_validate_room_category_property();

-- Canonical property visibility: authenticated staff see only properties they
-- belong to. Public guests may see active room inventory across properties;
-- property-specific booking routes will scope this further in Reservation
-- Foundation.
DROP POLICY IF EXISTS "Public read active room categories" ON public.room_categories;
CREATE POLICY "Anon read active room categories"
  ON public.room_categories FOR SELECT TO anon
  USING (status = 'active');

CREATE POLICY "Staff read own property room categories"
  ON public.room_categories FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS "Public read active rooms" ON public.rooms;
CREATE POLICY "Anon read active rooms"
  ON public.rooms FOR SELECT TO anon
  USING (status = 'active');

CREATE POLICY "Staff read own property rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

DROP POLICY IF EXISTS "Public read active extras" ON public.extras;
CREATE POLICY "Anon read active extras"
  ON public.extras FOR SELECT TO anon
  USING (active);

CREATE POLICY "Staff read own property extras"
  ON public.extras FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

-- ---------------------------------------------------------------------------
-- Canonical organisation/property RLS.
-- ---------------------------------------------------------------------------
CREATE POLICY "Staff read own organisations"
  ON public.staynas_organisations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staynas_properties p
      WHERE p.organisation_id = id
        AND public.staynas_user_has_property_access(auth.uid(), p.id)
    )
  );

CREATE POLICY "Staff read own properties"
  ON public.staynas_properties FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), id));

CREATE POLICY "Managers manage own properties"
  ON public.staynas_properties FOR UPDATE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

CREATE POLICY "Staff read own property membership"
  ON public.staynas_property_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.staynas_user_has_property_access(auth.uid(), property_id)
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    )
  );

CREATE POLICY "Managers manage own property membership"
  ON public.staynas_property_members FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );

CREATE POLICY "Users manage own property context"
  ON public.staynas_user_property_context FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Keep timestamp behaviour consistent with the rest of the platform.
DROP TRIGGER IF EXISTS staynas_organisations_updated_at ON public.staynas_organisations;
CREATE TRIGGER staynas_organisations_updated_at
BEFORE UPDATE ON public.staynas_organisations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS staynas_properties_updated_at ON public.staynas_properties;
CREATE TRIGGER staynas_properties_updated_at
BEFORE UPDATE ON public.staynas_properties
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS staynas_property_members_updated_at ON public.staynas_property_members;
CREATE TRIGGER staynas_property_members_updated_at
BEFORE UPDATE ON public.staynas_property_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS staynas_user_property_context_updated_at ON public.staynas_user_property_context;
CREATE TRIGGER staynas_user_property_context_updated_at
BEFORE UPDATE ON public.staynas_user_property_context
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Reservation child rows inherit the property boundary from their booking.
DROP POLICY IF EXISTS "Staff read booking extras" ON public.booking_extras;
CREATE POLICY "Staff read own property booking extras"
  ON public.booking_extras FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND public.staynas_user_has_property_access(auth.uid(), b.property_id)
    )
  );
