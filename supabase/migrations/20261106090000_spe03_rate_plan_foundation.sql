-- SPE-03.02: property-scoped commercial rate-plan foundation.
-- Development/UAT migration only. Never apply to production without a separate release decision.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'standard_flexible',
  pricing_basis text NOT NULL DEFAULT 'per_room',
  currency text NOT NULL,
  meal_plan text NOT NULL DEFAULT 'room_only',
  cancellation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  refundable boolean NOT NULL DEFAULT true,
  booking_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date,
  effective_to date,
  parent_rate_plan_id uuid,
  publication_status text NOT NULL DEFAULT 'draft',
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_plans_code_nonempty CHECK (length(trim(code)) BETWEEN 2 AND 40),
  CONSTRAINT staynas_rate_plans_name_nonempty CHECK (length(trim(name)) BETWEEN 2 AND 120),
  CONSTRAINT staynas_rate_plans_category_nonempty CHECK (length(trim(category)) BETWEEN 2 AND 60),
  CONSTRAINT staynas_rate_plans_basis_check CHECK (pricing_basis IN ('per_room','per_person','occupancy_based')),
  CONSTRAINT staynas_rate_plans_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT staynas_rate_plans_meal_plan_check CHECK (meal_plan IN ('room_only','bed_breakfast','half_board','full_board','all_inclusive','custom')),
  CONSTRAINT staynas_rate_plans_publication_check CHECK (publication_status IN ('draft','published','suspended','archived')),
  CONSTRAINT staynas_rate_plans_effective_dates_check CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT staynas_rate_plans_parent_not_self CHECK (parent_rate_plan_id IS NULL OR parent_rate_plan_id <> id),
  CONSTRAINT staynas_rate_plans_version_positive CHECK (version > 0),
  CONSTRAINT staynas_rate_plans_property_id_id_unique UNIQUE (property_id,id),
  CONSTRAINT staynas_rate_plans_property_code_unique UNIQUE (property_id,code),
  CONSTRAINT staynas_rate_plans_parent_same_property_fk FOREIGN KEY (property_id,parent_rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS staynas_rate_plans_property_status_idx
  ON public.staynas_rate_plans(property_id,publication_status,active);
CREATE INDEX IF NOT EXISTS staynas_rate_plans_effective_idx
  ON public.staynas_rate_plans(property_id,effective_from,effective_to);

ALTER TABLE public.staynas_rate_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Property finance manage rate plans" ON public.staynas_rate_plans;
CREATE POLICY "Property finance manage rate plans"
  ON public.staynas_rate_plans FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

GRANT SELECT,INSERT,UPDATE,DELETE ON public.staynas_rate_plans TO authenticated;
REVOKE ALL ON public.staynas_rate_plans FROM anon;

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_plan_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  property_currency text;
  parent_row public.staynas_rate_plans%ROWTYPE;
BEGIN
  SELECT upper(currency) INTO property_currency
  FROM public.staynas_properties
  WHERE id=NEW.property_id;
  IF property_currency IS NULL OR property_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Rate plan property must have an explicit valid currency';
  END IF;
  IF upper(NEW.currency) <> property_currency THEN
    RAISE EXCEPTION 'Rate plan currency % must match property currency %',NEW.currency,property_currency;
  END IF;
  NEW.currency := property_currency;
  NEW.code := upper(trim(NEW.code));
  NEW.name := trim(NEW.name);
  IF NEW.parent_rate_plan_id IS NOT NULL THEN
    SELECT * INTO parent_row FROM public.staynas_rate_plans
    WHERE id=NEW.parent_rate_plan_id AND property_id=NEW.property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parent rate plan must belong to the same property'; END IF;
    IF EXISTS (
      WITH RECURSIVE ancestors(id,parent_rate_plan_id,path,cycle) AS (
        SELECT p.id,p.parent_rate_plan_id,ARRAY[p.id],false
        FROM public.staynas_rate_plans p
        WHERE p.id=NEW.parent_rate_plan_id AND p.property_id=NEW.property_id
        UNION ALL
        SELECT p.id,p.parent_rate_plan_id,a.path||p.id,p.id=ANY(a.path)
        FROM public.staynas_rate_plans p
        JOIN ancestors a ON p.id=a.parent_rate_plan_id
        WHERE p.property_id=NEW.property_id AND NOT a.cycle
      )
      SELECT 1 FROM ancestors WHERE id=NEW.id OR cycle
    ) THEN
      RAISE EXCEPTION 'Circular rate-plan inheritance is not permitted';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_rate_plans_context_guard ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_context_guard
  BEFORE INSERT OR UPDATE ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_plan_context();

CREATE TABLE IF NOT EXISTS public.staynas_rate_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_plan_versions_plan_fk
    FOREIGN KEY(property_id,rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_versions_unique UNIQUE(rate_plan_id,version)
);

ALTER TABLE public.staynas_rate_plan_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property finance read rate plan versions" ON public.staynas_rate_plan_versions;
CREATE POLICY "Property finance read rate plan versions"
  ON public.staynas_rate_plan_versions FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
GRANT SELECT ON public.staynas_rate_plan_versions TO authenticated;
REVOKE ALL ON public.staynas_rate_plan_versions FROM anon;

CREATE OR REPLACE FUNCTION public.prepare_staynas_rate_plan_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.version := 1;
  ELSIF (to_jsonb(OLD) - 'updated_at' - 'version') IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at' - 'version') THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_staynas_rate_plan_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  snapshot_value jsonb;
  actor uuid := auth.uid();
BEGIN
  IF TG_OP='UPDATE' AND NEW.version=OLD.version THEN RETURN NEW; END IF;
  snapshot_value := to_jsonb(NEW) - 'created_at' - 'updated_at';
  INSERT INTO public.staynas_rate_plan_versions(property_id,rate_plan_id,version,snapshot,changed_by,change_reason)
  VALUES(NEW.property_id,NEW.id,NEW.version,snapshot_value,actor,
    CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'updated' END);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_rate_plans_version_capture ON public.staynas_rate_plans;
DROP TRIGGER IF EXISTS staynas_rate_plans_version_prepare ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plans_version_prepare
  BEFORE INSERT OR UPDATE ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.prepare_staynas_rate_plan_version();
CREATE TRIGGER staynas_rate_plans_version_capture
  AFTER INSERT OR UPDATE ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.capture_staynas_rate_plan_version();

COMMIT;
