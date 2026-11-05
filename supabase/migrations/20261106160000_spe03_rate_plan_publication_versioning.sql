-- SPE-03.09: immutable publication snapshots, publication audit and authorized read contract.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_rate_plan_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  publication_number integer NOT NULL,
  rate_plan_version integer NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL,
  effective_from date,
  effective_to date,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  resolved_data jsonb NOT NULL,
  inheritance_trace jsonb NOT NULL,
  lineage jsonb NOT NULL,
  own_policy jsonb NOT NULL,
  room_type_assignments jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_plan_publications_plan_fk
    FOREIGN KEY(property_id,rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_publications_version_fk
    FOREIGN KEY(rate_plan_id,rate_plan_version)
    REFERENCES public.staynas_rate_plan_versions(rate_plan_id,version) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_publications_number_positive CHECK (publication_number>0),
  CONSTRAINT staynas_rate_plan_publications_version_positive CHECK (rate_plan_version>0),
  CONSTRAINT staynas_rate_plan_publications_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT staynas_rate_plan_publications_dates_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from),
  CONSTRAINT staynas_rate_plan_publications_hash_check CHECK (snapshot_hash ~ '^[a-f0-9]{32}$'),
  CONSTRAINT staynas_rate_plan_publications_unique UNIQUE(property_id,rate_plan_id,publication_number)
);
CREATE INDEX IF NOT EXISTS staynas_rate_plan_publications_current_idx
  ON public.staynas_rate_plan_publications(property_id,rate_plan_id,publication_number DESC);
ALTER TABLE public.staynas_rate_plan_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property finance read rate plan publications" ON public.staynas_rate_plan_publications;
CREATE POLICY "Property finance read rate plan publications"
  ON public.staynas_rate_plan_publications FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
GRANT SELECT ON public.staynas_rate_plan_publications TO authenticated;
REVOKE ALL ON public.staynas_rate_plan_publications FROM anon;

CREATE TABLE IF NOT EXISTS public.staynas_rate_plan_publication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  rate_plan_version integer NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  previous_active boolean NOT NULL,
  new_active boolean NOT NULL,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_plan_publication_events_plan_fk
    FOREIGN KEY(property_id,rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_publication_events_version_fk
    FOREIGN KEY(rate_plan_id,rate_plan_version)
    REFERENCES public.staynas_rate_plan_versions(rate_plan_id,version) ON DELETE RESTRICT,
  CONSTRAINT staynas_rate_plan_publication_events_type_check
    CHECK (event_type IN ('published','suspended','archived','draft_restored','activated','deactivated')),
  CONSTRAINT staynas_rate_plan_publication_events_reason_check
    CHECK (length(trim(change_reason)) BETWEEN 5 AND 500)
);
CREATE INDEX IF NOT EXISTS staynas_rate_plan_publication_events_lookup_idx
  ON public.staynas_rate_plan_publication_events(property_id,rate_plan_id,created_at DESC);
ALTER TABLE public.staynas_rate_plan_publication_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property finance read rate plan publication events" ON public.staynas_rate_plan_publication_events;
CREATE POLICY "Property finance read rate plan publication events"
  ON public.staynas_rate_plan_publication_events FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
GRANT SELECT ON public.staynas_rate_plan_publication_events TO authenticated;
REVOKE ALL ON public.staynas_rate_plan_publication_events FROM anon;

CREATE OR REPLACE FUNCTION public.prevent_staynas_rate_plan_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $function$
BEGIN
  RAISE EXCEPTION 'Rate-plan publication history is immutable';
END;
$function$;
DROP TRIGGER IF EXISTS staynas_rate_plan_publications_immutable ON public.staynas_rate_plan_publications;
CREATE TRIGGER staynas_rate_plan_publications_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_rate_plan_publications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staynas_rate_plan_publication_mutation();
DROP TRIGGER IF EXISTS staynas_rate_plan_publication_events_immutable ON public.staynas_rate_plan_publication_events;
CREATE TRIGGER staynas_rate_plan_publication_events_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_rate_plan_publication_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staynas_rate_plan_publication_mutation();

CREATE OR REPLACE FUNCTION public.require_staynas_rate_plan_publication_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $function$
DECLARE
  v_reason text := current_setting('staynas.rate_plan_publication_reason',true);
BEGIN
  IF OLD.publication_status IS DISTINCT FROM NEW.publication_status
     OR OLD.active IS DISTINCT FROM NEW.active THEN
    IF auth.uid() IS NULL OR length(trim(COALESCE(v_reason,''))) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'Publication and activation changes must use the audited publication RPC with a reason';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plan_publication_reason_guard ON public.staynas_rate_plans;
CREATE TRIGGER staynas_rate_plan_publication_reason_guard
  BEFORE UPDATE OF publication_status,active ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.require_staynas_rate_plan_publication_reason();

CREATE OR REPLACE FUNCTION public.capture_staynas_rate_plan_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_resolved jsonb;
  v_assignments jsonb;
  v_publication_number integer;
  v_published_at timestamptz;
  v_published_by uuid;
  v_hash text;
BEGIN
  IF OLD.publication_status='published'
     OR NEW.publication_status<>'published'
     OR NEW.active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_staynas_rate_plan_inheritance(NEW.property_id,NEW.id);
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'room_type_id',a.room_type_id,
      'name',c.name,
      'slug',c.slug,
      'display_order',a.display_order
    ) ORDER BY a.display_order,c.name),
    '[]'::jsonb
  ) INTO v_assignments
  FROM public.staynas_rate_plan_room_types a
  JOIN public.staynas_room_catalogue_types c ON c.id=a.room_type_id
  WHERE a.property_id=NEW.property_id AND a.rate_plan_id=NEW.id AND a.active=true;

  IF jsonb_array_length(v_assignments)=0 THEN
    RAISE EXCEPTION 'A published rate plan must have at least one active room-type assignment';
  END IF;

  SELECT COALESCE(MAX(publication_number),0)+1 INTO v_publication_number
  FROM public.staynas_rate_plan_publications
  WHERE property_id=NEW.property_id AND rate_plan_id=NEW.id;

  v_published_at := COALESCE(NEW.published_at,now());
  v_published_by := COALESCE(NEW.published_by,auth.uid());
  v_hash := md5(jsonb_build_object(
    'property_id',NEW.property_id,
    'rate_plan_id',NEW.id,
    'publication_number',v_publication_number,
    'rate_plan_version',NEW.version,
    'resolved_data',v_resolved->'resolved_data',
    'inheritance_trace',v_resolved->'inheritance_trace',
    'lineage',v_resolved->'lineage',
    'own_policy',v_resolved->'own_policy',
    'room_type_assignments',v_assignments,
    'effective_from',NEW.effective_from,
    'effective_to',NEW.effective_to
  )::text);

  INSERT INTO public.staynas_rate_plan_publications(
    property_id,rate_plan_id,publication_number,rate_plan_version,
    code,name,currency,effective_from,effective_to,published_by,published_at,
    resolved_data,inheritance_trace,lineage,own_policy,room_type_assignments,snapshot_hash
  ) VALUES (
    NEW.property_id,NEW.id,v_publication_number,NEW.version,
    NEW.code,NEW.name,NEW.currency,NEW.effective_from,NEW.effective_to,
    v_published_by,v_published_at,
    v_resolved->'resolved_data',v_resolved->'inheritance_trace',v_resolved->'lineage',
    v_resolved->'own_policy',v_assignments,v_hash
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_staynas_rate_plan_publication_capture ON public.staynas_rate_plans;
CREATE TRIGGER zz_staynas_rate_plan_publication_capture
  AFTER UPDATE OF publication_status ON public.staynas_rate_plans
  FOR EACH ROW
  WHEN (OLD.publication_status IS DISTINCT FROM 'published'
        AND NEW.publication_status='published' AND NEW.active=true)
  EXECUTE FUNCTION public.capture_staynas_rate_plan_publication();

CREATE OR REPLACE FUNCTION public.audit_staynas_rate_plan_publication_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_event text;
  v_reason text;
BEGIN
  IF OLD.publication_status IS DISTINCT FROM NEW.publication_status THEN
    v_event := CASE NEW.publication_status
      WHEN 'published' THEN 'published'
      WHEN 'suspended' THEN 'suspended'
      WHEN 'archived' THEN 'archived'
      WHEN 'draft' THEN 'draft_restored'
      ELSE 'draft_restored'
    END;
  ELSIF OLD.active IS DISTINCT FROM NEW.active THEN
    v_event := CASE WHEN NEW.active THEN 'activated' ELSE 'deactivated' END;
  ELSE
    RETURN NEW;
  END IF;

  v_reason := COALESCE(
    NULLIF(trim(current_setting('staynas.rate_plan_publication_reason',true)),''),
    'Rate-plan publication state changed to '||NEW.publication_status
  );
  INSERT INTO public.staynas_rate_plan_publication_events(
    property_id,rate_plan_id,rate_plan_version,previous_status,new_status,
    previous_active,new_active,event_type,actor_id,change_reason
  ) VALUES (
    NEW.property_id,NEW.id,NEW.version,OLD.publication_status,NEW.publication_status,
    OLD.active,NEW.active,v_event,COALESCE(NEW.updated_by,auth.uid()),v_reason
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_plan_publication_event_capture ON public.staynas_rate_plans;
DROP TRIGGER IF EXISTS zy_staynas_rate_plan_publication_event_capture ON public.staynas_rate_plans;
CREATE TRIGGER zy_staynas_rate_plan_publication_event_capture
  AFTER UPDATE OF publication_status,active ON public.staynas_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_staynas_rate_plan_publication_event();

CREATE OR REPLACE FUNCTION public.set_staynas_rate_plan_publication(
  _rate_plan_id uuid,
  _publication_status text,
  _active boolean,
  _change_reason text
)
RETURNS public.staynas_rate_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_plan public.staynas_rate_plans%ROWTYPE;
  v_next_active boolean;
  v_updated public.staynas_rate_plans%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _publication_status NOT IN ('draft','published','suspended','archived') THEN
    RAISE EXCEPTION 'Unsupported rate-plan publication status';
  END IF;
  IF length(trim(COALESCE(_change_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'A publication change reason between 5 and 500 characters is required';
  END IF;

  SELECT * INTO v_plan FROM public.staynas_rate_plans
  WHERE id=_rate_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rate plan not found'; END IF;
  IF public.staynas_active_property_id(v_uid) IS DISTINCT FROM v_plan.property_id
     OR NOT public.staynas_user_has_property_access(v_uid,v_plan.property_id)
     OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','finance','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Rate-plan publication access denied';
  END IF;
  IF v_plan.publication_status='archived' THEN
    RAISE EXCEPTION 'Archived rate plans are terminal and cannot be changed';
  END IF;

  v_next_active := CASE WHEN _publication_status='archived' THEN false
    ELSE COALESCE(_active,v_plan.active) END;
  IF _publication_status='published' AND NOT v_next_active THEN
    RAISE EXCEPTION 'An inactive rate plan cannot be published';
  END IF;
  IF _publication_status='published' AND NOT EXISTS (
    SELECT 1 FROM public.staynas_rate_plan_room_types a
    WHERE a.property_id=v_plan.property_id AND a.rate_plan_id=v_plan.id AND a.active=true
  ) THEN
    RAISE EXCEPTION 'Assign at least one active room type before publishing';
  END IF;
  IF v_plan.publication_status=_publication_status AND v_plan.active=v_next_active THEN
    RETURN v_plan;
  END IF;

  PERFORM set_config('staynas.rate_plan_publication_reason',trim(_change_reason),true);
  UPDATE public.staynas_rate_plans
  SET publication_status=_publication_status,
      active=v_next_active,
      updated_by=v_uid,
      published_by=CASE WHEN _publication_status='published' THEN v_uid ELSE published_by END,
      published_at=CASE WHEN _publication_status='published' THEN now() ELSE published_at END
  WHERE id=_rate_plan_id
  RETURNING * INTO v_updated;
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_staynas_rate_plan_publication(uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_staynas_rate_plan_publication(uuid,text,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_staynas_published_rate_plans(_property_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := current_setting('request.jwt.claim.role',true);
BEGIN
  IF _property_id IS NULL THEN RAISE EXCEPTION 'Property id is required'; END IF;
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL
       OR public.staynas_active_property_id(v_uid) IS DISTINCT FROM _property_id
       OR NOT public.staynas_user_has_property_access(v_uid,_property_id)
       OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','finance','admin','reservations','reception']::public.app_role[]) THEN
      RAISE EXCEPTION 'Published rate-plan access denied for property';
    END IF;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'publication_id',p.id,
      'property_id',p.property_id,
      'rate_plan_id',p.rate_plan_id,
      'publication_number',p.publication_number,
      'rate_plan_version',p.rate_plan_version,
      'code',p.code,
      'name',p.name,
      'currency',p.currency,
      'effective_from',p.effective_from,
      'effective_to',p.effective_to,
      'published_by',p.published_by,
      'published_at',p.published_at,
      'resolved_data',p.resolved_data,
      'inheritance_trace',p.inheritance_trace,
      'lineage',p.lineage,
      'own_policy',p.own_policy,
      'room_type_assignments',p.room_type_assignments,
      'snapshot_hash',p.snapshot_hash
    ) ORDER BY p.name,p.publication_number), '[]'::jsonb)
    FROM (
      SELECT DISTINCT ON (pub.rate_plan_id) pub.*
      FROM public.staynas_rate_plan_publications pub
      JOIN public.staynas_rate_plans plan
        ON plan.id=pub.rate_plan_id AND plan.property_id=pub.property_id
      WHERE pub.property_id=_property_id
        AND plan.publication_status='published'
        AND plan.active=true
      ORDER BY pub.rate_plan_id,pub.publication_number DESC
    ) p
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_staynas_published_rate_plans(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_staynas_published_rate_plans(uuid) TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.prevent_staynas_rate_plan_publication_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.require_staynas_rate_plan_publication_reason() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.capture_staynas_rate_plan_publication() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.audit_staynas_rate_plan_publication_event() FROM PUBLIC,anon,authenticated;

COMMENT ON TABLE public.staynas_rate_plan_publications IS
  'Immutable, property-scoped resolved rate-plan publication snapshots. Only the latest publication of currently published and active plans is exposed to authorized consumers.';
COMMENT ON TABLE public.staynas_rate_plan_publication_events IS
  'Append-only audit of rate-plan publication, suspension, archive, draft restoration and activation state changes.';
COMMENT ON FUNCTION public.get_staynas_published_rate_plans(uuid) IS
  'Returns immutable publication snapshots for active published rate plans only. Draft and suspended plans are never exposed; no pricing calculation is performed.';
COMMENT ON FUNCTION public.set_staynas_rate_plan_publication(uuid,text,boolean,text) IS
  'Audited property-scoped rate-plan lifecycle transition. Publishing captures a resolved immutable publication snapshot; confirmed bookings are not modified.';

COMMIT;
