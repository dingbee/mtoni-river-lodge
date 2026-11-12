CREATE OR REPLACE FUNCTION public.cps03_is_campaign_property_public(_property_id uuid, _organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_properties p
    WHERE p.id = _property_id
      AND p.organisation_id = _organisation_id
      AND p.status = 'active'
      AND p.currency ~ '^[A-Z]{3}$'
  )
$function$;
