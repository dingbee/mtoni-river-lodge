-- CC-06 commercial account contact privacy and integrity contracts.
BEGIN;
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.commercial_account_contacts'::regclass) THEN
    RAISE EXCEPTION 'Commercial account contacts must have RLS enabled';
  END IF;
  IF has_table_privilege('anon','public.commercial_account_contacts','SELECT')
    OR has_table_privilege('authenticated','public.commercial_account_contacts','SELECT')
    OR has_table_privilege('authenticated','public.commercial_account_contacts','INSERT')
    OR has_table_privilege('authenticated','public.commercial_account_contacts','UPDATE')
    OR has_table_privilege('authenticated','public.commercial_account_contacts','DELETE') THEN
    RAISE EXCEPTION 'Tenant/browser roles can access founder commercial contact records';
  END IF;
  IF NOT has_table_privilege('service_role','public.commercial_account_contacts','SELECT')
    OR NOT has_table_privilege('service_role','public.commercial_account_contacts','INSERT')
    OR NOT has_table_privilege('service_role','public.commercial_account_contacts','UPDATE')
    OR has_table_privilege('service_role','public.commercial_account_contacts','DELETE') THEN
    RAISE EXCEPTION 'Commercial account contact service privileges violate least privilege';
  END IF;
  IF has_function_privilege('anon','public.commercial_register_account(uuid,text,text,text,text,text,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_register_account(uuid,text,text,text,text,text,text,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_register_account(uuid,text,text,text,text,text,text,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Commercial account registration RPC grants violate founder-only authorization';
  END IF;
END $$;
ROLLBACK;
