-- SPE-03.04: explicit, property-scoped parent/child rate-plan inheritance.
-- UAT migration only. Does not alter SPE-02 pricing functions or existing booking snapshots.
BEGIN;

ALTER TABLE public.staynas_rate_plans
  ADD COLUMN IF NOT EXISTS rate_plan_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.staynas_rate_plans
  DROP CONSTRAINT IF EXISTS staynas_rate_plans_data_object_check;
ALTER TABLE public.staynas_rate_plans
  ADD CONSTRAINT staynas_rate_plans_data_object_check
  CHECK (
    jsonb_typeof(rate_plan_data) = 'object'
    AND rate_plan_data - ARRAY[
      'base_rates','seasonal_rates','daily_rates','occupancy_rules','restrictions'
    ]::text[] = '{}'::jsonb
    AND (NOT (rate_plan_data ? 'base_rates') OR jsonb_typeof(rate_plan_data->'base_rates') = 'object')
    AND (NOT (rate_plan_data ? 'seasonal_rates') OR jsonb_typeof(rate_plan_data->'seasonal_rates') = 'object')
    AND (NOT (rate_plan_data ? 'daily_rates') OR jsonb_typeof(rate_plan_data->'daily_rates') = 'object')
    AND (NOT (rate_plan_data ? 'occupancy_rules') OR jsonb_typeof(rate_plan_data->'occupancy_rules') = 'object')
    AND (NOT (rate_plan_data ? 'restrictions') OR jsonb_typeof(rate_plan_data->'restrictions') = 'object')
  );

COMMENT ON COLUMN public.staynas_rate_plans.rate_plan_data IS
  'Explicit inheritable commercial data. Allowed keyed objects: base_rates, seasonal_rates, daily_rates, occupancy_rules, restrictions. Missing keys inherit; child keys override matching parent keys; JSON null at a nested key explicitly clears that inherited value. Cancellation/refundability and booking policies are deliberately excluded.';

-- Serialize parent-link changes per property so concurrent writes cannot create a cycle.
CREATE OR REPLACE FUNCTION public.lock_staynas_rate_plan_inheritance_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.property_id::text, 30404));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a_staynas_rate_plan_inheritance_tree_lock ON public.staynas_rate_plans;
CREATE TRIGGER a_staynas_rate_plan_inheritance_tree_lock
  BEFORE INSERT OR UPDATE OF property_id,parent_rate_plan_id
  ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.lock_staynas_rate_plan_inheritance_tree();

-- Deep merge semantics: object keys merge recursively; arrays/scalars replace;
-- JSON null is a deliberate child override and is not treated as missing.
CREATE OR REPLACE FUNCTION public.staynas_rate_plan_jsonb_deep_merge(_base jsonb, _overlay jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
DECLARE
  result_value jsonb := COALESCE(_base, '{}'::jsonb);
  entry record;
BEGIN
  IF jsonb_typeof(COALESCE(_overlay, '{}'::jsonb)) <> 'object' THEN
    RETURN COALESCE(_overlay, '{}'::jsonb);
  END IF;
  IF jsonb_typeof(result_value) <> 'object' THEN
    result_value := '{}'::jsonb;
  END IF;
  FOR entry IN SELECT key,value FROM jsonb_each(_overlay)
  LOOP
    IF entry.value = 'null'::jsonb THEN
      result_value := jsonb_set(result_value, ARRAY[entry.key], 'null'::jsonb, true);
    ELSIF result_value ? entry.key
      AND jsonb_typeof(result_value->entry.key) = 'object'
      AND jsonb_typeof(entry.value) = 'object' THEN
      result_value := jsonb_set(
        result_value, ARRAY[entry.key],
        public.staynas_rate_plan_jsonb_deep_merge(result_value->entry.key, entry.value), true
      );
    ELSE
      result_value := jsonb_set(result_value, ARRAY[entry.key], entry.value, true);
    END IF;
  END LOOP;
  RETURN result_value;
END;
$function$;

-- Resolve one plan's inheritable data root-to-child. Trace records the nearest
-- ancestor contributing each domain and the complete versioned lineage.
CREATE OR REPLACE FUNCTION public.resolve_staynas_rate_plan_inheritance(
  _property_id uuid,
  _rate_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_plan record;
  v_resolved jsonb := '{}'::jsonb;
  v_trace jsonb := '{}'::jsonb;
  v_lineage jsonb := '[]'::jsonb;
  v_domain text;
  v_own_policy jsonb;
  v_own_refundable boolean;
  v_own_conditions jsonb;
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.staynas_active_property_id(v_uid) IS DISTINCT FROM _property_id
     OR NOT public.staynas_user_has_property_access(v_uid,_property_id)
     OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','finance','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Rate-plan inheritance access denied for property';
  END IF;

  FOR v_plan IN
    WITH RECURSIVE ancestors AS (
      SELECT p.id,p.parent_rate_plan_id,p.property_id,p.rate_plan_data,p.version,
        p.cancellation_policy,p.refundable,p.booking_conditions,
        0 AS depth,ARRAY[p.id] AS path,false AS cycle
      FROM public.staynas_rate_plans p
      WHERE p.id=_rate_plan_id AND p.property_id=_property_id
      UNION ALL
      SELECT parent.id,parent.parent_rate_plan_id,parent.property_id,parent.rate_plan_data,parent.version,
        parent.cancellation_policy,parent.refundable,parent.booking_conditions,
        child.depth+1,child.path||parent.id,parent.id=ANY(child.path)
      FROM public.staynas_rate_plans parent
      JOIN ancestors child ON parent.id=child.parent_rate_plan_id
      WHERE parent.property_id=_property_id AND NOT child.cycle
    )
    SELECT * FROM ancestors ORDER BY depth DESC
  LOOP
    v_found := true;
    IF v_plan.cycle THEN RAISE EXCEPTION 'Circular rate-plan inheritance detected'; END IF;
    v_resolved := public.staynas_rate_plan_jsonb_deep_merge(v_resolved,COALESCE(v_plan.rate_plan_data,'{}'::jsonb));
    v_lineage := v_lineage || jsonb_build_array(jsonb_build_object(
      'rate_plan_id',v_plan.id,'version',v_plan.version,'depth',v_plan.depth
    ));
    FOREACH v_domain IN ARRAY ARRAY['base_rates','seasonal_rates','daily_rates','occupancy_rules','restrictions']
    LOOP
      IF v_plan.rate_plan_data ? v_domain THEN
        v_trace := jsonb_set(v_trace,ARRAY[v_domain],jsonb_build_object(
          'source_rate_plan_id',v_plan.id,'source_version',v_plan.version,
          'inheritance_depth',v_plan.depth
        ),true);
      END IF;
    END LOOP;
    IF v_plan.depth=0 THEN
      -- Policies are returned only from the selected child plan, never inherited.
      v_own_policy := v_plan.cancellation_policy;
      v_own_refundable := v_plan.refundable;
      v_own_conditions := v_plan.booking_conditions;
    END IF;
  END LOOP;

  IF NOT v_found THEN RAISE EXCEPTION 'Rate plan not found in active property'; END IF;

  RETURN jsonb_build_object(
    'property_id',_property_id,
    'rate_plan_id',_rate_plan_id,
    'resolved_data',v_resolved,
    'inheritance_trace',v_trace,
    'lineage',v_lineage,
    'own_policy',jsonb_build_object(
      'cancellation_policy',COALESCE(v_own_policy,'{}'::jsonb),
      'refundable',COALESCE(v_own_refundable,true),
      'booking_conditions',COALESCE(v_own_conditions,'{}'::jsonb)
    ),
    'policy_inherited',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_rate_plan_jsonb_deep_merge(jsonb,jsonb) FROM PUBLIC,anon;\nGRANT EXECUTE ON FUNCTION public.staynas_rate_plan_jsonb_deep_merge(jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_staynas_rate_plan_inheritance(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_staynas_rate_plan_inheritance(uuid,uuid) TO authenticated;

-- Published children require a published, active parent. A parent cannot be
-- suspended/archived while a published descendant still relies on it.
CREATE OR REPLACE FUNCTION public.enforce_staynas_rate_plan_parent_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.publication_status='published' AND NEW.parent_rate_plan_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.staynas_rate_plans parent
       WHERE parent.id=NEW.parent_rate_plan_id
         AND parent.property_id=NEW.property_id
         AND parent.publication_status='published'
         AND parent.active=true
     ) THEN
    RAISE EXCEPTION 'A child rate plan can be published only when its parent is published and active';
  END IF;

  IF TG_OP='UPDATE'
     AND OLD.publication_status='published'
     AND NEW.publication_status IN ('suspended','archived')
     AND EXISTS (
       WITH RECURSIVE descendants(id,path) AS (
         SELECT child.id,ARRAY[NEW.id,child.id]
         FROM public.staynas_rate_plans child
         WHERE child.property_id=NEW.property_id AND child.parent_rate_plan_id=NEW.id
         UNION ALL
         SELECT child.id,d.path||child.id
         FROM public.staynas_rate_plans child
         JOIN descendants d ON child.parent_rate_plan_id=d.id
         WHERE child.property_id=NEW.property_id AND NOT child.id=ANY(d.path)
       )
       SELECT 1 FROM descendants d
       JOIN public.staynas_rate_plans child ON child.id=d.id
       WHERE child.publication_status='published' AND child.active=true
     ) THEN
    RAISE EXCEPTION 'Suspend or archive published child rate plans before changing the parent lifecycle';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plan_parent_publication_guard ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plan_parent_publication_guard
  BEFORE INSERT OR UPDATE ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staynas_rate_plan_parent_publication();

-- Version rows are append-only, including for privileged application roles.
CREATE OR REPLACE FUNCTION public.prevent_staynas_rate_plan_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'Rate-plan version history is immutable';
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plan_versions_immutable ON public.staynas_rate_plan_versions;
CREATE TRIGGER staynas_rate_plan_versions_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_rate_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staynas_rate_plan_version_mutation();

COMMIT;
