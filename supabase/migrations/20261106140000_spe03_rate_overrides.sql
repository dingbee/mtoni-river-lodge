-- SPE-03.07: controlled, auditable rate overrides.
-- Keeps room_inventory.price_override as the legacy exact-room/date quote input.
-- Does not change inventory availability or replace the SPE-04 deterministic resolver.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_rate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  scope text NOT NULL,
  rate_plan_id uuid,
  room_type_id uuid REFERENCES public.staynas_room_catalogue_types(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES public.rooms(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  nightly_rate numeric(12,2) NOT NULL,
  currency text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  previous_inventory_price_override numeric(12,2),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_overrides_scope_check CHECK (
    scope IN ('room_date','room_type','rate_plan','rate_plan_room_type')
  ),
  CONSTRAINT staynas_rate_overrides_status_check CHECK (
    status IN ('pending','approved','rejected','revoked')
  ),
  CONSTRAINT staynas_rate_overrides_rate_positive CHECK (nightly_rate > 0),
  CONSTRAINT staynas_rate_overrides_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT staynas_rate_overrides_reason_check CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  CONSTRAINT staynas_rate_overrides_dates_check CHECK (effective_to >= effective_from),
  CONSTRAINT staynas_rate_overrides_scope_shape_check CHECK (
    (scope='room_date' AND room_id IS NOT NULL AND room_type_id IS NULL AND rate_plan_id IS NULL AND effective_from=effective_to)
    OR (scope='room_type' AND room_type_id IS NOT NULL AND room_id IS NULL AND rate_plan_id IS NULL)
    OR (scope='rate_plan' AND rate_plan_id IS NOT NULL AND room_type_id IS NULL AND room_id IS NULL)
    OR (scope='rate_plan_room_type' AND rate_plan_id IS NOT NULL AND room_type_id IS NOT NULL AND room_id IS NULL)
  ),
  CONSTRAINT staynas_rate_overrides_plan_fk
    FOREIGN KEY(property_id,rate_plan_id)
    REFERENCES public.staynas_rate_plans(property_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS staynas_rate_overrides_property_status_dates_idx
  ON public.staynas_rate_overrides(property_id,status,effective_from,effective_to);
CREATE INDEX IF NOT EXISTS staynas_rate_overrides_plan_idx
  ON public.staynas_rate_overrides(property_id,rate_plan_id,status)
  WHERE rate_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staynas_rate_overrides_room_type_idx
  ON public.staynas_rate_overrides(property_id,room_type_id,status)
  WHERE room_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staynas_rate_overrides_room_date_idx
  ON public.staynas_rate_overrides(room_id,effective_from)
  WHERE room_id IS NOT NULL;

ALTER TABLE public.staynas_rate_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property finance manage rate overrides" ON public.staynas_rate_overrides;
CREATE POLICY "Property finance manage rate overrides"
  ON public.staynas_rate_overrides FOR ALL TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  )
  WITH CHECK (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
GRANT SELECT,INSERT,UPDATE ON public.staynas_rate_overrides TO authenticated;
REVOKE ALL ON public.staynas_rate_overrides FROM anon;

CREATE TABLE IF NOT EXISTS public.staynas_rate_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  override_id uuid REFERENCES public.staynas_rate_overrides(id) ON DELETE SET NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_rate_override_audit_source_check CHECK (
    source IN ('rate_override','room_inventory_price_override')
  )
);
CREATE INDEX IF NOT EXISTS staynas_rate_override_audit_property_created_idx
  ON public.staynas_rate_override_audit(property_id,created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_rate_override_audit_override_idx
  ON public.staynas_rate_override_audit(override_id,created_at DESC);
ALTER TABLE public.staynas_rate_override_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property finance read rate override audit" ON public.staynas_rate_override_audit;
CREATE POLICY "Property finance read rate override audit"
  ON public.staynas_rate_override_audit FOR SELECT TO authenticated
  USING (
    public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[])
  );
GRANT SELECT ON public.staynas_rate_override_audit TO authenticated;
REVOKE ALL ON public.staynas_rate_override_audit FROM anon;

CREATE OR REPLACE FUNCTION public.prevent_staynas_rate_override_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $function$
BEGIN
  RAISE EXCEPTION 'Rate override audit history is immutable';
END;
$function$;
DROP TRIGGER IF EXISTS staynas_rate_override_audit_immutable ON public.staynas_rate_override_audit;
CREATE TRIGGER staynas_rate_override_audit_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_rate_override_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staynas_rate_override_audit_mutation();

CREATE OR REPLACE FUNCTION public.validate_staynas_rate_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_currency text;
  v_room_property uuid;
  v_room_type uuid;
  v_plan_status text;
BEGIN
  SELECT upper(currency) INTO v_currency
  FROM public.staynas_properties WHERE id=NEW.property_id;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Rate override property must have an explicit currency';
  END IF;
  IF upper(NEW.currency) <> v_currency THEN
    RAISE EXCEPTION 'Rate override currency must match property currency %',v_currency;
  END IF;
  NEW.currency := v_currency;
  NEW.reason := trim(NEW.reason);
  NEW.updated_at := now();

  IF NEW.room_id IS NOT NULL THEN
    SELECT property_id,catalogue_type_id INTO v_room_property,v_room_type
    FROM public.rooms WHERE id=NEW.room_id;
    IF v_room_property IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'Override room must belong to the same property';
    END IF;
  END IF;
  IF NEW.room_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.property_id=NEW.property_id AND r.catalogue_type_id=NEW.room_type_id
  ) THEN
    RAISE EXCEPTION 'Override room type is not configured for this property';
  END IF;
  IF NEW.room_id IS NOT NULL AND v_room_type IS NULL THEN
    RAISE EXCEPTION 'Override room must have a configured room catalogue type';
  END IF;
  IF NEW.rate_plan_id IS NOT NULL THEN
    SELECT publication_status INTO v_plan_status
    FROM public.staynas_rate_plans
    WHERE id=NEW.rate_plan_id AND property_id=NEW.property_id;
    IF v_plan_status IS NULL THEN RAISE EXCEPTION 'Rate plan must belong to the same property'; END IF;
    IF NEW.room_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.staynas_rate_plan_room_types a
      WHERE a.property_id=NEW.property_id AND a.rate_plan_id=NEW.rate_plan_id
        AND a.room_type_id=NEW.room_type_id AND a.active=true
    ) THEN
      RAISE EXCEPTION 'Room type must be actively assigned to the selected rate plan';
    END IF;
  END IF;

  IF TG_OP='INSERT' AND NEW.status='approved' THEN
    RAISE EXCEPTION 'Create rate overrides as pending, then approve them';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status='pending' THEN
    RAISE EXCEPTION 'An approved override cannot return to pending';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status='approved'
     AND (to_jsonb(OLD) - 'updated_at' - 'approved_by' - 'approved_at')
       IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at' - 'approved_by' - 'approved_at') THEN
    RAISE EXCEPTION 'Approved rate override terms are immutable; revoke and create a new override';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('rejected','revoked') AND NEW.status<>OLD.status THEN
    RAISE EXCEPTION 'Rejected and revoked overrides are terminal';
  END IF;
  IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.rate_plan_id IS NOT NULL AND v_plan_status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'Overrides for a rate plan can be approved only while that plan is published';
    END IF;
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
    NEW.rejected_by := NULL;
    NEW.rejected_at := NULL;
    NEW.revoked_by := NULL;
    NEW.revoked_at := NULL;
  ELSIF NEW.status='rejected' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.rejected_by := auth.uid();
    NEW.rejected_at := now();
  ELSIF NEW.status='revoked' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'revoked') THEN
    NEW.revoked_by := auth.uid();
    NEW.revoked_at := now();
  END IF;

  IF NEW.status='approved' AND EXISTS (
    SELECT 1 FROM public.staynas_rate_overrides o
    WHERE o.property_id=NEW.property_id AND o.id<>NEW.id
      AND o.status='approved'
      AND o.scope=NEW.scope
      AND o.rate_plan_id IS NOT DISTINCT FROM NEW.rate_plan_id
      AND o.room_type_id IS NOT DISTINCT FROM NEW.room_type_id
      AND o.room_id IS NOT DISTINCT FROM NEW.room_id
      AND daterange(o.effective_from,o.effective_to,'[]') &&
          daterange(NEW.effective_from,NEW.effective_to,'[]')
  ) THEN
    RAISE EXCEPTION 'Approved rate overrides cannot overlap for the same property, plan and room scope';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_overrides_validate ON public.staynas_rate_overrides;
CREATE TRIGGER staynas_rate_overrides_validate
  BEFORE INSERT OR UPDATE ON public.staynas_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_rate_override();

CREATE OR REPLACE FUNCTION public.audit_staynas_rate_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_row jsonb;
  v_before jsonb;
  v_property_id uuid;
  v_override_id uuid;
  v_event text;
BEGIN
  IF TG_OP='DELETE' THEN
    v_row := to_jsonb(OLD);
    v_before := v_row;
    v_property_id := OLD.property_id;
    v_override_id := OLD.id;
    v_event := 'deleted';
  ELSE
    v_row := to_jsonb(NEW);
    v_before := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    v_property_id := NEW.property_id;
    v_override_id := NEW.id;
    v_event := CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'updated' END;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_event := 'status_'||NEW.status;
    END IF;
  END IF;
  INSERT INTO public.staynas_rate_override_audit(
    property_id,override_id,source,event_type,actor_id,before_state,after_state
  ) VALUES(v_property_id,v_override_id,'rate_override',v_event,auth.uid(),v_before,v_row);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_rate_overrides_audit ON public.staynas_rate_overrides;
CREATE TRIGGER staynas_rate_overrides_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.staynas_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.audit_staynas_rate_override();

-- Preserve the legacy SPE-02 price input. Every price_override change is
-- auditable; this trigger never changes available_units or is_blocked.
CREATE OR REPLACE FUNCTION public.audit_staynas_inventory_price_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_property_id uuid;
BEGIN
  IF OLD.price_override IS NOT DISTINCT FROM NEW.price_override THEN RETURN NEW; END IF;
  SELECT property_id INTO v_property_id FROM public.rooms WHERE id=NEW.room_id;
  INSERT INTO public.staynas_rate_override_audit(
    property_id,source,event_type,actor_id,
    before_state,after_state
  ) VALUES(
    v_property_id,'room_inventory_price_override','legacy_price_override_changed',auth.uid(),
    jsonb_build_object('room_id',NEW.room_id,'date',NEW.date,'price_override',OLD.price_override),
    jsonb_build_object('room_id',NEW.room_id,'date',NEW.date,'price_override',NEW.price_override)
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS room_inventory_price_override_audit ON public.room_inventory;
CREATE TRIGGER room_inventory_price_override_audit
  AFTER UPDATE OF price_override ON public.room_inventory
  FOR EACH ROW EXECUTE FUNCTION public.audit_staynas_inventory_price_override();

-- Approved exact-room/date overrides are the approval-controlled extension of
-- the legacy inventory price_override. The RPC changes only price_override;
-- availability units and block state are not touched. Existing inventory rows
-- are required: the RPC will not create or backfill inventory.
CREATE OR REPLACE FUNCTION public.apply_staynas_room_date_rate_override(
  _property_id uuid,
  _room_id uuid,
  _stay_date date,
  _nightly_rate numeric,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_override_id uuid;
  v_currency text;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL
     OR public.staynas_active_property_id(v_actor) IS DISTINCT FROM _property_id
     OR NOT public.staynas_user_has_property_access(v_actor,_property_id)
     OR NOT public.has_any_role(v_actor,ARRAY['owner','manager','finance','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Rate override access denied';
  END IF;
  IF _nightly_rate IS NULL OR _nightly_rate<=0 OR length(trim(COALESCE(_reason,'')))<5 THEN
    RAISE EXCEPTION 'A positive nightly rate and a reason of at least five characters are required';
  END IF;
  SELECT upper(currency) INTO v_currency FROM public.staynas_properties WHERE id=_property_id;
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id=_room_id AND property_id=_property_id) THEN
    RAISE EXCEPTION 'Room does not belong to the selected property';
  END IF;
  INSERT INTO public.staynas_rate_overrides(
    property_id,scope,room_id,effective_from,effective_to,
    nightly_rate,currency,reason,status,created_by
  ) VALUES(
    _property_id,'room_date',_room_id,_stay_date,_stay_date,
    _nightly_rate,v_currency,trim(_reason),'pending',v_actor
  ) RETURNING id INTO v_override_id;

  -- Approval is explicit and separate from proposal creation.
  RETURN jsonb_build_object('override_id',v_override_id,'status','pending','currency',v_currency);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_staynas_room_date_rate_override(_override_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_override public.staynas_rate_overrides%ROWTYPE;
  v_inventory public.room_inventory%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO v_override FROM public.staynas_rate_overrides
  WHERE id=_override_id AND scope='room_date'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room/date rate override not found'; END IF;
  IF v_actor IS NULL
     OR public.staynas_active_property_id(v_actor) IS DISTINCT FROM v_override.property_id
     OR NOT public.staynas_user_has_property_access(v_actor,v_override.property_id)
     OR NOT public.has_any_role(v_actor,ARRAY['owner','manager','finance','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Rate override approval access denied';
  END IF;
  IF v_override.status<>'pending' THEN RAISE EXCEPTION 'Only pending rate overrides can be approved'; END IF;

  SELECT * INTO v_inventory FROM public.room_inventory
  WHERE room_id=v_override.room_id AND date=v_override.effective_from FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory calendar row is missing; rate override was not applied';
  END IF;
  UPDATE public.staynas_rate_overrides
  SET status='approved',previous_inventory_price_override=v_inventory.price_override,applied_at=now()
  WHERE id=_override_id;

  UPDATE public.room_inventory
  SET price_override=v_override.nightly_rate,updated_at=now()
  WHERE room_id=v_override.room_id AND date=v_override.effective_from;

  RETURN jsonb_build_object('override_id',_override_id,'status','approved',
    'nightly_rate',v_override.nightly_rate,'currency',v_override.currency);
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_staynas_rate_override() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.audit_staynas_rate_override() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.audit_staynas_inventory_price_override() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prevent_staynas_rate_override_audit_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apply_staynas_room_date_rate_override(uuid,uuid,date,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.approve_staynas_room_date_rate_override(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.revoke_staynas_room_date_rate_override(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_staynas_room_date_rate_override(uuid,uuid,date,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_staynas_room_date_rate_override(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staynas_room_date_rate_override(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.revoke_staynas_room_date_rate_override(_override_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_override public.staynas_rate_overrides%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO v_override FROM public.staynas_rate_overrides
  WHERE id=_override_id AND scope='room_date'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room/date rate override not found'; END IF;
  IF v_actor IS NULL
     OR public.staynas_active_property_id(v_actor) IS DISTINCT FROM v_override.property_id
     OR NOT public.staynas_user_has_property_access(v_actor,v_override.property_id)
     OR NOT public.has_any_role(v_actor,ARRAY['owner','manager','finance','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Rate override revocation access denied';
  END IF;
  IF v_override.status<>'approved' THEN RAISE EXCEPTION 'Only approved overrides can be revoked'; END IF;

  UPDATE public.room_inventory
  SET price_override=v_override.previous_inventory_price_override,updated_at=now()
  WHERE room_id=v_override.room_id AND date=v_override.effective_from;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory calendar row is missing; override was not revoked'; END IF;

  UPDATE public.staynas_rate_overrides SET status='revoked' WHERE id=_override_id;
  RETURN jsonb_build_object('override_id',_override_id,'status','revoked',
    'restored_price_override',v_override.previous_inventory_price_override);
END;
$function$;

COMMENT ON TABLE public.staynas_rate_overrides IS
  'Property-scoped override proposals and approvals. Rate-plan/room-type scopes are metadata for SPE-04 resolution; exact room/date approval writes only the legacy room_inventory.price_override field.';
COMMENT ON TABLE public.staynas_rate_override_audit IS
  'Append-only audit trail for rate override lifecycle and legacy room_inventory.price_override changes.';
COMMENT ON FUNCTION public.apply_staynas_room_date_rate_override(uuid,uuid,date,numeric,text) IS
  'Creates a pending exact-room/date rate override proposal. Does not modify inventory until approved.';
COMMENT ON FUNCTION public.approve_staynas_room_date_rate_override(uuid) IS
  'Approves a pending exact-room/date override and updates only room_inventory.price_override; availability and blocked state remain unchanged.';

COMMIT;
