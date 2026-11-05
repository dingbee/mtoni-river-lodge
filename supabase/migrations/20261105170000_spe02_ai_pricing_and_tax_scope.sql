-- SPE-02: property isolation for AI pricing recommendations and tax configuration.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_id_property_id_spe02_uidx
  ON public.rooms (id, property_id);

ALTER TABLE public.ai_pricing_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid;

UPDATE public.ai_pricing_recommendations rec
SET property_id = room.property_id
FROM public.rooms room
WHERE rec.room_id = room.id
  AND rec.property_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ai_pricing_recommendations
    WHERE property_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'SPE-02 blocked: AI pricing recommendations without a room/property mapping require manual tenant assignment';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_pricing_recommendations_property_id_fkey'
      AND conrelid = 'public.ai_pricing_recommendations'::regclass
  ) THEN
    ALTER TABLE public.ai_pricing_recommendations
      ADD CONSTRAINT ai_pricing_recommendations_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES public.staynas_properties(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_pricing_recommendations_room_property_fkey'
      AND conrelid = 'public.ai_pricing_recommendations'::regclass
  ) THEN
    ALTER TABLE public.ai_pricing_recommendations
      ADD CONSTRAINT ai_pricing_recommendations_room_property_fkey
      FOREIGN KEY (room_id, property_id)
      REFERENCES public.rooms(id, property_id) ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.ai_pricing_recommendations
  ALTER COLUMN property_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_pricing_recommendations_property_created_idx
  ON public.ai_pricing_recommendations (property_id, created_at DESC);

CREATE POLICY "Property staff read AI pricing recommendations"
  ON public.ai_pricing_recommendations FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE POLICY "Property staff create AI pricing recommendations"
  ON public.ai_pricing_recommendations FOR INSERT TO authenticated
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE POLICY "Property staff action AI pricing recommendations"
  ON public.ai_pricing_recommendations FOR UPDATE TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE POLICY "Property finance manage tax rules"
  ON public.staynas_property_tax_rules FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

COMMIT;
