-- CPS-04: property-scoped booking product selection and campaign offer configuration.
-- Reuses existing rooms, rate plans and immutable publication snapshots.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_booking_product_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  rate_plan_publication_id uuid NOT NULL REFERENCES public.staynas_rate_plan_publications(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('permanent', 'campaign')),
  campaign_slug text,
  display_order integer NOT NULL DEFAULT 100 CHECK (display_order >= 0),
  public_visible boolean NOT NULL DEFAULT false,
  offer_code text,
  offer_name text,
  offer_description text,
  booking_starts_at timestamptz,
  booking_ends_at timestamptz,
  stay_starts_on date,
  stay_ends_on date,
  minimum_stay integer,
  maximum_stay integer,
  guest_eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms_and_conditions text,
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'paused', 'expired')),
  configuration_version integer NOT NULL DEFAULT 1 CHECK (configuration_version > 0),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_booking_product_campaign_scope CHECK (
    (channel = 'permanent' AND campaign_slug IS NULL AND offer_code IS NULL)
    OR
    (channel = 'campaign'
      AND campaign_slug IS NOT NULL AND length(trim(campaign_slug)) BETWEEN 2 AND 100
      AND offer_code IS NOT NULL AND length(trim(offer_code)) BETWEEN 2 AND 64
      AND offer_name IS NOT NULL AND length(trim(offer_name)) BETWEEN 2 AND 160)
  ),
  CONSTRAINT staynas_booking_product_dates CHECK (
    (booking_ends_at IS NULL OR booking_starts_at IS NULL OR booking_ends_at > booking_starts_at)
    AND (stay_ends_on IS NULL OR stay_starts_on IS NULL OR stay_ends_on >= stay_starts_on)
    AND (minimum_stay IS NULL OR minimum_stay >= 1)
    AND (maximum_stay IS NULL OR maximum_stay >= 1)
    AND (minimum_stay IS NULL OR maximum_stay IS NULL OR maximum_stay >= minimum_stay)
  ),
  CONSTRAINT staynas_booking_product_unique
    UNIQUE (property_id, channel, campaign_slug, room_id, rate_plan_publication_id)
);

CREATE INDEX IF NOT EXISTS staynas_booking_product_public_lookup
  ON public.staynas_booking_product_configurations
    (property_id, channel, campaign_slug, publication_status, public_visible, display_order);

ALTER TABLE public.staynas_booking_product_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Property managers manage booking product configurations"
  ON public.staynas_booking_product_configurations;

CREATE POLICY "Property managers manage booking product configurations"
  ON public.staynas_booking_product_configurations
  FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role(
      (select auth.uid()),
      ARRAY['owner', 'manager', 'admin', 'marketing', 'finance']::public.app_role[]
    )
  )
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()), property_id)
    AND public.has_any_role(
      (select auth.uid()),
      ARRAY['owner', 'manager', 'admin', 'marketing', 'finance']::public.app_role[]
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.staynas_booking_product_configurations TO authenticated;
REVOKE ALL ON public.staynas_booking_product_configurations FROM anon;

-- Public reads must go through the trusted server resolver. Anonymous clients
-- cannot read or mutate configuration rows directly.

CREATE OR REPLACE FUNCTION public.validate_staynas_booking_product_configuration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room_property uuid;
  v_room_type_id uuid;
  v_property_currency text;
  v_publication_property uuid;
  v_publication_currency text;
  v_publication_assignments jsonb;
  v_plan_status text;
  v_plan_active boolean;
BEGIN
  SELECT r.property_id, r.catalogue_type_id
    INTO v_room_property, v_room_type_id
  FROM public.rooms r
  WHERE r.id = NEW.room_id AND r.status = 'active';

  IF v_room_property IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'Selected room does not belong to the configured property or is inactive';
  END IF;

  SELECT upper(p.currency)
    INTO v_property_currency
  FROM public.staynas_properties p
  WHERE p.id = NEW.property_id AND p.status = 'active';

  IF v_property_currency IS NULL OR v_property_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Property operating currency must be explicitly configured';
  END IF;

  SELECT pub.property_id, pub.currency, pub.room_type_assignments,
         rp.publication_status, rp.active
    INTO v_publication_property, v_publication_currency, v_publication_assignments,
         v_plan_status, v_plan_active
  FROM public.staynas_rate_plan_publications pub
  JOIN public.staynas_rate_plans rp
    ON rp.id = pub.rate_plan_id AND rp.property_id = pub.property_id
  WHERE pub.id = NEW.rate_plan_publication_id;

  IF v_publication_property IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'Rate-plan publication does not belong to the configured property';
  END IF;

  IF v_plan_status IS DISTINCT FROM 'published' OR v_plan_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only active published rate plans can be selected';
  END IF;

  IF upper(v_publication_currency) IS DISTINCT FROM v_property_currency THEN
    RAISE EXCEPTION 'Published rate-plan currency must match the property operating currency';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_publication_assignments, '[]'::jsonb)) assignment
    WHERE assignment ->> 'room_type_id' = v_room_type_id::text
  ) THEN
    RAISE EXCEPTION 'Published rate plan is not assigned to the selected room type';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staynas_rate_plan_publications pub
    WHERE pub.id = NEW.rate_plan_publication_id
      AND pub.property_id = NEW.property_id
      AND pub.publication_number = (
        SELECT max(latest.publication_number)
        FROM public.staynas_rate_plan_publications latest
        WHERE latest.property_id = pub.property_id
          AND latest.rate_plan_id = pub.rate_plan_id
      )
  ) THEN
    RAISE EXCEPTION 'Only the latest published rate-plan snapshot can be selected';
  END IF;

  IF NEW.channel = 'campaign' AND NEW.publication_status = 'published'
     AND (NEW.offer_code IS NULL OR NEW.offer_name IS NULL) THEN
    RAISE EXCEPTION 'Published campaign products require a named offer';
  END IF;

  IF NEW.publication_status = 'published' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
    NEW.published_by := COALESCE(NEW.published_by, auth.uid());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_staynas_booking_product_configuration() FROM PUBLIC;

DROP TRIGGER IF EXISTS staynas_booking_product_configuration_guard
  ON public.staynas_booking_product_configurations;

CREATE TRIGGER staynas_booking_product_configuration_guard
  BEFORE INSERT OR UPDATE ON public.staynas_booking_product_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_staynas_booking_product_configuration();

CREATE OR REPLACE FUNCTION public.prevent_staynas_booking_product_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.publication_status = 'published'
     AND (to_jsonb(OLD) - 'updated_at' - 'updated_by' - 'publication_status' - 'published_at' - 'published_by')
       IS DISTINCT FROM
         (to_jsonb(NEW) - 'updated_at' - 'updated_by' - 'publication_status' - 'published_at' - 'published_by') THEN
    NEW.configuration_version := OLD.configuration_version + 1;
    NEW.publication_status := 'draft';
    NEW.public_visible := false;
    NEW.published_at := NULL;
    NEW.published_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_booking_product_republish_guard
  ON public.staynas_booking_product_configurations;

CREATE TRIGGER staynas_booking_product_republish_guard
  BEFORE UPDATE ON public.staynas_booking_product_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_staynas_booking_product_publication_mutation();

COMMIT;
