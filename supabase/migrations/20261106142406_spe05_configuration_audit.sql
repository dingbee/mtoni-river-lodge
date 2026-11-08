-- SPE-05 configuration history. Every config mutation receives a durable before/after record.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_pricing_configuration_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK(entity_type IN ('tax','fee','promotion')),
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  previous_version integer,
  new_version integer,
  before_state jsonb,
  after_state jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staynas_pricing_audit_property_time_idx
  ON public.staynas_pricing_configuration_audit(property_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS staynas_pricing_audit_entity_idx
  ON public.staynas_pricing_configuration_audit(entity_type,entity_id,changed_at DESC);

ALTER TABLE public.staynas_pricing_configuration_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Property staff read pricing configuration audit" ON public.staynas_pricing_configuration_audit;
CREATE POLICY "Property staff read pricing configuration audit"
  ON public.staynas_pricing_configuration_audit FOR SELECT TO authenticated
  USING(public.staynas_user_has_property_access((select auth.uid()),property_id)
    AND public.has_any_role((select auth.uid()),ARRAY['owner','manager','finance','admin']::public.app_role[]));
GRANT SELECT ON public.staynas_pricing_configuration_audit TO authenticated;
GRANT ALL ON public.staynas_pricing_configuration_audit TO service_role;

CREATE OR REPLACE FUNCTION public.audit_staynas_pricing_configuration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_property_id uuid;
  v_entity_id uuid;
  v_entity_type text := TG_ARGV[0];
  v_previous_version integer;
  v_new_version integer;
BEGIN
  IF TG_OP='DELETE' THEN
    v_before:=to_jsonb(OLD);
    v_property_id:=OLD.property_id;
    v_entity_id:=OLD.id;
    v_previous_version:=OLD.version;
    INSERT INTO public.staynas_pricing_configuration_audit(
      property_id,entity_type,entity_id,operation,previous_version,before_state,changed_by
    ) VALUES(v_property_id,v_entity_type,v_entity_id,TG_OP,v_previous_version,v_before,auth.uid());
    RETURN OLD;
  END IF;

  IF TG_OP='UPDATE' THEN
    v_before:=to_jsonb(OLD);
    v_after:=to_jsonb(NEW);
    IF (v_after - 'version' - 'updated_at') IS DISTINCT FROM (v_before - 'version' - 'updated_at') THEN
      NEW.version:=OLD.version+1;
    END IF;
    NEW.updated_at:=now();
    v_property_id:=NEW.property_id;
    v_entity_id:=NEW.id;
    v_previous_version:=OLD.version;
    v_new_version:=NEW.version;
  ELSE
    v_after:=to_jsonb(NEW);
    v_property_id:=NEW.property_id;
    v_entity_id:=NEW.id;
    v_new_version:=NEW.version;
  END IF;

  INSERT INTO public.staynas_pricing_configuration_audit(
    property_id,entity_type,entity_id,operation,previous_version,new_version,before_state,after_state,changed_by
  ) VALUES(v_property_id,v_entity_type,v_entity_id,TG_OP,v_previous_version,v_new_version,v_before,v_after,auth.uid());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_tax_rules_audit ON public.staynas_property_tax_rules;
CREATE TRIGGER staynas_tax_rules_audit
  BEFORE INSERT OR UPDATE OR DELETE ON public.staynas_property_tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_staynas_pricing_configuration('tax');

DROP TRIGGER IF EXISTS staynas_fee_rules_audit ON public.staynas_property_fee_rules;
CREATE TRIGGER staynas_fee_rules_audit
  BEFORE INSERT OR UPDATE OR DELETE ON public.staynas_property_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_staynas_pricing_configuration('fee');

DROP TRIGGER IF EXISTS staynas_promotions_audit ON public.staynas_property_promotions;
CREATE TRIGGER staynas_promotions_audit
  BEFORE INSERT OR UPDATE OR DELETE ON public.staynas_property_promotions
  FOR EACH ROW EXECUTE FUNCTION public.audit_staynas_pricing_configuration('promotion');

REVOKE ALL ON FUNCTION public.audit_staynas_pricing_configuration() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.audit_staynas_pricing_configuration() TO service_role;

COMMIT;
