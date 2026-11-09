-- CC-06 founder subscription creation service authorization contract.
BEGIN;
DO $$
BEGIN
  IF has_function_privilege('anon','public.commercial_is_founder_admin_service(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_is_founder_admin_service(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_is_founder_admin_service(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Service-principal founder verification helper grants violate least privilege';
  END IF;
  IF has_function_privilege('anon','public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Founder subscription registration service grants violate founder-only authorization';
  END IF;
END $$;
ROLLBACK;
