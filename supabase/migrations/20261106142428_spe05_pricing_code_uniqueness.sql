-- SPE-05 duplicate configuration guards; preserves any pre-existing tax rows.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS staynas_fee_code_ci_uidx
  ON public.staynas_property_fee_rules(property_id,lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS staynas_promotion_code_ci_uidx
  ON public.staynas_property_promotions(property_id,lower(code))
  WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_staynas_tax_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
BEGIN
  IF NEW.tax_code IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.staynas_property_tax_rules t
    WHERE t.property_id=NEW.property_id
      AND t.id IS DISTINCT FROM NEW.id
      AND lower(t.tax_code)=lower(NEW.tax_code)
      AND t.active=true
      AND NEW.active=true
  ) THEN
    RAISE EXCEPTION 'An active tax rule with this code already exists for the property'
      USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_tax_code_unique_guard ON public.staynas_property_tax_rules;
CREATE TRIGGER staynas_tax_code_unique_guard
  BEFORE INSERT OR UPDATE OF property_id,tax_code,active
  ON public.staynas_property_tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_staynas_tax_code();

REVOKE ALL ON FUNCTION public.prevent_duplicate_staynas_tax_code() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_staynas_tax_code() TO service_role;

COMMIT;
