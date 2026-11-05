-- SPE-02: property-scoped pricing rules and immutable booking price snapshots.
-- Forward-only migration. Do not replay historical migrations or repair the migration ledger here.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_id_property_id_spe02_uidx
  ON public.rooms (id, property_id);

ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS property_id uuid;

-- Room-scoped legacy rules can be assigned unambiguously. Property-wide legacy
-- rules cannot be inferred safely and cause this migration to fail closed.
UPDATE public.pricing_rules pr
SET property_id = r.property_id
FROM public.rooms r
WHERE pr.room_id = r.id
  AND pr.property_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pricing_rules WHERE property_id IS NULL) THEN
    RAISE EXCEPTION
      'SPE-02 blocked: pricing_rules contains unscoped rules; assign each rule to an explicit property before migration';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pricing_rules_property_id_fkey'
      AND conrelid = 'public.pricing_rules'::regclass
  ) THEN
    ALTER TABLE public.pricing_rules
      ADD CONSTRAINT pricing_rules_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pricing_rules_room_property_fkey'
      AND conrelid = 'public.pricing_rules'::regclass
  ) THEN
    ALTER TABLE public.pricing_rules
      ADD CONSTRAINT pricing_rules_room_property_fkey
      FOREIGN KEY (room_id, property_id)
      REFERENCES public.rooms(id, property_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pricing_rules_room_scope_requires_room'
      AND conrelid = 'public.pricing_rules'::regclass
  ) THEN
    ALTER TABLE public.pricing_rules
      ADD CONSTRAINT pricing_rules_room_scope_requires_room
      CHECK (scope <> 'room' OR room_id IS NOT NULL);
  END IF;
END;
$$;

ALTER TABLE public.pricing_rules
  ALTER COLUMN property_id SET NOT NULL;

DROP POLICY IF EXISTS "Staff read pricing rules" ON public.pricing_rules;
DROP POLICY IF EXISTS "Finance manage pricing rules" ON public.pricing_rules;

CREATE POLICY "Property staff read pricing rules"
  ON public.pricing_rules FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE POLICY "Property finance manage pricing rules"
  ON public.pricing_rules FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE INDEX IF NOT EXISTS pricing_rules_property_active_priority_idx
  ON public.pricing_rules (property_id, active, priority, starts_on, ends_on);

ALTER TABLE public.booking_nights
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.prevent_booking_pricing_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.pricing_snapshot IS DISTINCT FROM NEW.pricing_snapshot
     AND OLD.pricing_snapshot <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Booking pricing snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_pricing_snapshot_immutable ON public.bookings;
CREATE TRIGGER bookings_pricing_snapshot_immutable
  BEFORE UPDATE OF pricing_snapshot ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_pricing_snapshot_mutation();

DROP TRIGGER IF EXISTS booking_nights_pricing_snapshot_immutable ON public.booking_nights;
CREATE TRIGGER booking_nights_pricing_snapshot_immutable
  BEFORE UPDATE OF pricing_snapshot ON public.booking_nights
  FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_pricing_snapshot_mutation();

COMMIT;
