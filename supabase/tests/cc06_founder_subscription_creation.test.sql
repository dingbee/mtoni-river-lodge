-- CC-06 founder subscription creation service authorization contract.
BEGIN;
DO $$
BEGIN
  IF has_function_privilege('anon','public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles can execute founder subscription registration';
  END IF;
  IF NOT has_function_privilege('service_role','public.commercial_create_subscription_for_founder(uuid,text,integer,text,text,integer,text[],text,jsonb,boolean,text,text,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Founder subscription registration service role is not granted';
  END IF;
END $$;
ROLLBACK;
