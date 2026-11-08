-- Serialize approval checks so concurrent requests cannot create overlapping approved overrides.
BEGIN;
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
  v_plan_active boolean;
  v_plan_effective_from date;
  v_plan_effective_to date;
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
    SELECT publication_status,active,effective_from,effective_to
      INTO v_plan_status,v_plan_active,v_plan_effective_from,v_plan_effective_to
    FROM public.staynas_rate_plans
    WHERE id=NEW.rate_plan_id AND property_id=NEW.property_id;
    IF v_plan_status IS NULL THEN RAISE EXCEPTION 'Rate plan must belong to the same property'; END IF;
    IF NEW.effective_from < COALESCE(v_plan_effective_from,NEW.effective_from)
       OR NEW.effective_to > COALESCE(v_plan_effective_to,NEW.effective_to) THEN
      RAISE EXCEPTION 'Override effective dates must fall within the rate plan effective period';
    END IF;
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
  IF TG_OP='UPDATE' AND OLD.status IN ('rejected','revoked') AND NEW.status<>OLD.status THEN
    RAISE EXCEPTION 'Rejected and revoked overrides are terminal';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Pending overrides may only be approved or rejected';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status NOT IN ('approved','revoked') THEN
    RAISE EXCEPTION 'Approved overrides may only be revoked';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved'
     AND (to_jsonb(OLD) - 'updated_at' - 'approved_by' - 'approved_at' - 'status' - 'revoked_by' - 'revoked_at')
       IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at' - 'approved_by' - 'approved_at' - 'status' - 'revoked_by' - 'revoked_at') THEN
    RAISE EXCEPTION 'Approved rate override terms are immutable; revoke and create a new override';
  END IF;
  IF TG_OP='UPDATE' AND OLD.scope='room_date' AND OLD.status='pending'
     AND NEW.status='approved'
     AND current_setting('staynas.rate_override_rpc',true) IS DISTINCT FROM 'approve' THEN
    RAISE EXCEPTION 'Exact room/date overrides must be approved through the inventory-safe approval RPC';
  END IF;
  IF TG_OP='UPDATE' AND OLD.scope='room_date' AND OLD.status='approved'
     AND NEW.status='revoked'
     AND current_setting('staynas.rate_override_rpc',true) IS DISTINCT FROM 'revoke' THEN
    RAISE EXCEPTION 'Exact room/date overrides must be revoked through the inventory-safe revocation RPC';
  END IF;
  IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.rate_plan_id IS NOT NULL
       AND (v_plan_status IS DISTINCT FROM 'published' OR v_plan_active IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'Overrides for a rate plan can be approved only while that plan is published and active';
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

  IF NEW.status='approved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      concat_ws(':',NEW.property_id::text,NEW.scope,
        COALESCE(NEW.rate_plan_id::text,''),COALESCE(NEW.room_type_id::text,''),
        COALESCE(NEW.room_id::text,'')),0
    ));
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
COMMIT;
