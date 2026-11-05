-- SPE-03.03: property-scoped rate-plan to room-type assignments.
-- Development/UAT migration only. No production application is authorized.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_rate_plan_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  rate_plan_id uuid NOT NULL,
  room_type_id uuid NOT NULL REFERENCES public.staynas_room_catalogue_types(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_plan_room_types_plan_fk
    FOREIGN KEY(property_id,rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_room_types_unique
    UNIQUE(property_id,rate_plan_id,room_type_id),
  CONSTRAINT staynas_rate_plan_room_types_order_nonnegative
    CHECK(display_order >= 0)
);

CREATE INDEX IF NOT EXISTS staynas_rate_plan_room_types_property_room_idx
  ON public.staynas_rate_plan_room_types(property_id,room_type_id,active);
CREATE INDEX IF NOT EXISTS staynas_rate_plan_room_types_plan_idx
  ON public.staynas_rate_plan_room_types(property_id,rate_plan_id,active);

ALTER TABLE public.staynas_rate_plan_room_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Property finance manage rate plan room types" ON public.staynas_rate_plan_room_types;
CREATE POLICY "Property finance manage rate plan room types"
  ON public.staynas_rate_plan_room_types FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

GRANT SELECT,INSERT,UPDATE,DELETE ON public.staynas_rate_plan_room_types TO authenticated;
REVOKE ALL ON public.staynas_rate_plan_room_types FROM anon;

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_room_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.property_id=NEW.property_id AND r.catalogue_type_id=NEW.room_type_id
  ) THEN
    RAISE EXCEPTION 'Room type is not configured for the active property';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_rate_plan_room_types_context_guard ON public.staynas_rate_plan_room_types;
CREATE TRIGGER staynas_rate_plan_room_types_context_guard
  BEFORE INSERT OR UPDATE ON public.staynas_rate_plan_room_types
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_room_type();

COMMIT;
