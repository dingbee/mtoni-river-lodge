ALTER TABLE public.booking_holds
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

UPDATE public.booking_holds h
SET property_id = r.property_id
FROM public.rooms r
WHERE h.room_id = r.id AND h.property_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_holds WHERE property_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot scope booking holds: one or more holds have no resolvable room property';
  END IF;
END $$;

ALTER TABLE public.booking_holds ALTER COLUMN property_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_holds_property_active
  ON public.booking_holds(property_id,status,expires_at);

CREATE OR REPLACE FUNCTION public.staynas_enforce_hold_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _room_property uuid;
BEGIN
  SELECT property_id INTO _room_property FROM public.rooms WHERE id=NEW.room_id;
  IF _room_property IS NULL THEN RAISE EXCEPTION 'Room property is required'; END IF;
  IF NEW.property_id IS NULL THEN NEW.property_id := _room_property; END IF;
  IF NEW.property_id <> _room_property THEN RAISE EXCEPTION 'Hold property does not match room property'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS staynas_booking_holds_property_trg ON public.booking_holds;
CREATE TRIGGER staynas_booking_holds_property_trg
BEFORE INSERT OR UPDATE OF room_id, property_id ON public.booking_holds
FOR EACH ROW EXECUTE FUNCTION public.staynas_enforce_hold_property();

DROP POLICY IF EXISTS "Staff can read payment events" ON public.payment_events;
DROP POLICY IF EXISTS "Staff read holds" ON public.booking_holds;
DROP POLICY IF EXISTS "Staff manage holds" ON public.booking_holds;
DROP POLICY IF EXISTS "Staff delete holds" ON public.booking_holds;
DROP POLICY IF EXISTS "Anyone reads by id" ON public.booking_holds;

CREATE POLICY "Staff read own property holds"
  ON public.booking_holds FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));
CREATE POLICY "Staff manage own property holds"
  ON public.booking_holds FOR UPDATE TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id))
  WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id));
CREATE POLICY "Admins delete own property holds"
  ON public.booking_holds FOR DELETE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  );