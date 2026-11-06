-- DC-05.02 — durable provider resource mappings.
-- DEVELOPMENT/UAT ARTIFACT ONLY. Do not apply to production.
-- Dependency: DC-04 connection persistence and SPE-03 canonical rate-plan
-- foundation/room-type assignment migrations must be present before application.
BEGIN;

DO $dc05$
BEGIN
  IF to_regclass('public.staynas_rate_plans') IS NULL
     OR to_regclass('public.staynas_room_catalogue_types') IS NULL
     OR to_regclass('public.staynas_distribution_connections') IS NULL THEN
    RAISE EXCEPTION 'DC-05.02 requires DC-04 connection persistence and SPE-03 canonical rate-plan/room-type schema';
  END IF;
END
$dc05$;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_listing_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_listing_id text NOT NULL CHECK (length(trim(external_listing_id)) BETWEEN 1 AND 256),
  internal_room_type_id uuid NOT NULL REFERENCES public.staynas_room_catalogue_types(id) ON DELETE RESTRICT,
  mapping_status text NOT NULL DEFAULT 'pending' CHECK (mapping_status IN ('pending','active','disabled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_listing_id),
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_room_id text NOT NULL CHECK (length(trim(external_room_id)) BETWEEN 1 AND 256),
  internal_room_type_id uuid NOT NULL REFERENCES public.staynas_room_catalogue_types(id) ON DELETE RESTRICT,
  mapping_status text NOT NULL DEFAULT 'pending' CHECK (mapping_status IN ('pending','active','disabled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_room_id),
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_rate_plan_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_rate_plan_id text NOT NULL CHECK (length(trim(external_rate_plan_id)) BETWEEN 1 AND 256),
  internal_rate_plan_id uuid NOT NULL,
  mapping_status text NOT NULL DEFAULT 'pending' CHECK (mapping_status IN ('pending','active','disabled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_rate_plan_id),
  FOREIGN KEY (connection_id, organisation_id, property_id)
    REFERENCES public.staynas_distribution_connections(id, organisation_id, property_id) ON DELETE RESTRICT,
  FOREIGN KEY (property_id, internal_rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.validate_staynas_distribution_room_type_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.staynas_room_catalogue_types t ON t.id = r.catalogue_type_id
    WHERE r.property_id = NEW.property_id
      AND r.catalogue_type_id = NEW.internal_room_type_id
      AND r.status = 'active'
      AND t.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Mapped room type is not configured as active inventory for this property'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_staynas_distribution_room_type_mapping()
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.validate_staynas_distribution_rate_plan_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.mapping_status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.staynas_rate_plans p
    WHERE p.property_id = NEW.property_id
      AND p.id = NEW.internal_rate_plan_id
      AND p.active = true
      AND p.publication_status = 'published'
  ) THEN
    RAISE EXCEPTION 'An active channel mapping requires a published active rate plan in the same property'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_staynas_distribution_rate_plan_mapping()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS staynas_distribution_listing_mapping_scope_guard
  ON public.staynas_distribution_listing_mappings;
CREATE TRIGGER staynas_distribution_listing_mapping_scope_guard
  BEFORE INSERT OR UPDATE ON public.staynas_distribution_listing_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_distribution_room_type_mapping();

DROP TRIGGER IF EXISTS staynas_distribution_room_mapping_scope_guard
  ON public.staynas_distribution_room_mappings;
CREATE TRIGGER staynas_distribution_room_mapping_scope_guard
  BEFORE INSERT OR UPDATE ON public.staynas_distribution_room_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_distribution_room_type_mapping();

DROP TRIGGER IF EXISTS staynas_distribution_rate_plan_mapping_guard
  ON public.staynas_distribution_rate_plan_mappings;
CREATE TRIGGER staynas_distribution_rate_plan_mapping_guard
  BEFORE INSERT OR UPDATE ON public.staynas_distribution_rate_plan_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_distribution_rate_plan_mapping();

ALTER TABLE public.staynas_distribution_listing_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_rate_plan_mappings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_listing_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_room_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staynas_distribution_rate_plan_mappings FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_listing_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_room_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.staynas_distribution_rate_plan_mappings TO service_role;

CREATE INDEX IF NOT EXISTS staynas_distribution_listing_mapping_property_idx
  ON public.staynas_distribution_listing_mappings(property_id, connection_id, mapping_status);
CREATE INDEX IF NOT EXISTS staynas_distribution_room_mapping_property_idx
  ON public.staynas_distribution_room_mappings(property_id, connection_id, mapping_status);
CREATE INDEX IF NOT EXISTS staynas_distribution_rate_mapping_property_idx
  ON public.staynas_distribution_rate_plan_mappings(property_id, connection_id, mapping_status);

COMMENT ON TABLE public.staynas_distribution_listing_mappings IS
  'Maps an external channel listing to a canonical StayNas room catalogue type inside one property connection.';
COMMENT ON TABLE public.staynas_distribution_room_mappings IS
  'Maps an external channel room identifier to a canonical StayNas room catalogue type, not a physical room or inventory row.';
COMMENT ON TABLE public.staynas_distribution_rate_plan_mappings IS
  'Maps external channel rate identifiers to canonical property-scoped published StayNas rate plans. Never stores prices.';

COMMIT;
