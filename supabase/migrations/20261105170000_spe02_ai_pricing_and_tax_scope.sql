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
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE POLICY "Property staff create AI pricing recommendations"
  ON public.ai_pricing_recommendations FOR INSERT TO authenticated
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

CREATE POLICY "Property staff action AI pricing recommendations"
  ON public.ai_pricing_recommendations FOR UPDATE TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

-- The tax-rule foundation was historically provisioned outside the tracked
-- migration chain. Keep clean resets self-contained and match the live UAT
-- contract before attaching the property-scoped policy below.
CREATE TABLE IF NOT EXISTS public.staynas_property_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_code text,
  calculation_type text NOT NULL
    CHECK (calculation_type IN ('inclusive_percent','exclusive_percent','fixed_per_night','fixed_per_booking')),
  rate numeric NOT NULL CHECK (rate >= 0),
  currency text,
  applies_to text NOT NULL DEFAULT 'accommodation'
    CHECK (applies_to IN ('accommodation','extras','all')),
  is_compound boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tax_mode text NOT NULL DEFAULT 'exclusive'
    CHECK (tax_mode IN ('inclusive','exclusive')),
  taxable_components text[] NOT NULL DEFAULT ARRAY['accommodation','extras']::text[],
  jurisdiction_code text,
  display_label text,
  priority integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT staynas_property_tax_rules_check
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CONSTRAINT staynas_tax_validity_check
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CONSTRAINT staynas_tax_rate_check CHECK (rate >= 0)
);

CREATE INDEX IF NOT EXISTS idx_staynas_property_tax_rules_active
  ON public.staynas_property_tax_rules(property_id,active,valid_from,valid_to);

ALTER TABLE public.staynas_property_tax_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Property finance manage tax rules"
  ON public.staynas_property_tax_rules FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role((select auth.uid()), ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_pricing_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staynas_property_tax_rules TO authenticated;

COMMIT;
