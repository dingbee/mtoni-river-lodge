-- SPE-03.04 follow-up: persist immutable effective-inheritance snapshots.
-- UAT migration only. SPE-04 pricing/booking integration will consume this contract.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_rate_plan_resolution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  rate_plan_id uuid NOT NULL,
  rate_plan_version integer NOT NULL,
  resolved_data jsonb NOT NULL,
  inheritance_trace jsonb NOT NULL,
  lineage jsonb NOT NULL,
  own_policy jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_plan_resolution_snapshots_plan_fk
    FOREIGN KEY(property_id,rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_resolution_snapshots_hash_check
    CHECK(snapshot_hash ~ '^[a-f0-9]{32}$')
);

CREATE INDEX IF NOT EXISTS staynas_rate_plan_resolution_snapshots_lookup_idx
  ON public.staynas_rate_plan_resolution_snapshots(property_id,rate_plan_id,created_at DESC);

ALTER TABLE public.staynas_rate_plan_resolution_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property finance read inheritance snapshots" ON public.staynas_rate_plan_resolution_snapshots;
CREATE POLICY "Property finance read inheritance snapshots"
  ON public.staynas_rate_plan_resolution_snapshots FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
DROP POLICY IF EXISTS "Property finance create inheritance snapshots" ON public.staynas_rate_plan_resolution_snapshots;
CREATE POLICY "Property finance create inheritance snapshots"
  ON public.staynas_rate_plan_resolution_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    created_by=(select auth.uid())
    AND public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );

GRANT SELECT,INSERT ON public.staynas_rate_plan_resolution_snapshots TO authenticated;
REVOKE ALL ON public.staynas_rate_plan_resolution_snapshots FROM anon;

CREATE OR REPLACE FUNCTION public.create_staynas_rate_plan_inheritance_snapshot(
  _property_id uuid,
  _rate_plan_id uuid
)
RETURNS public.staynas_rate_plan_resolution_snapshots
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_resolved jsonb;
  v_version integer;
  v_snapshot public.staynas_rate_plan_resolution_snapshots%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_resolved := public.resolve_staynas_rate_plan_inheritance(_property_id,_rate_plan_id);
  SELECT version INTO v_version
  FROM public.staynas_rate_plans
  WHERE id=_rate_plan_id AND property_id=_property_id;
  IF v_version IS NULL THEN RAISE EXCEPTION 'Rate plan not found in active property'; END IF;

  INSERT INTO public.staynas_rate_plan_resolution_snapshots(
    property_id,rate_plan_id,rate_plan_version,resolved_data,inheritance_trace,lineage,
    own_policy,snapshot_hash,created_by
  ) VALUES (
    _property_id,_rate_plan_id,v_version,
    v_resolved->'resolved_data',v_resolved->'inheritance_trace',v_resolved->'lineage',
    v_resolved->'own_policy',
    md5(jsonb_build_object(
      'property_id',_property_id,'rate_plan_id',_rate_plan_id,
      'rate_plan_version',v_version,'resolved',v_resolved
    )::text),
    v_uid
  )
  RETURNING * INTO v_snapshot;
  RETURN v_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_staynas_rate_plan_inheritance_snapshot(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_staynas_rate_plan_inheritance_snapshot(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_staynas_rate_plan_resolution_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'Resolved rate-plan snapshots are immutable';
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plan_resolution_snapshots_immutable ON public.staynas_rate_plan_resolution_snapshots;
CREATE TRIGGER staynas_rate_plan_resolution_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_rate_plan_resolution_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staynas_rate_plan_resolution_snapshot_mutation();

COMMIT;
