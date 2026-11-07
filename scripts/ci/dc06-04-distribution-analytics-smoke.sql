\set ON_ERROR_STOP on
DO $$
DECLARE
  v_fn oid := to_regprocedure('public.staynas_get_distribution_analytics(timestamp with time zone,timestamp with time zone)');
  v_definer boolean;
  v_config text[];
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'DC-06.04 distribution analytics RPC missing';
  END IF;
  SELECT p.prosecdef,p.proconfig INTO v_definer,v_config
  FROM pg_proc p WHERE p.oid=v_fn;
  IF NOT v_definer THEN
    RAISE EXCEPTION 'DC-06.04 analytics RPC must be SECURITY DEFINER for service-only ledgers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(coalesce(v_config,ARRAY[]::text[])) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'DC-06.04 analytics RPC must pin search_path';
  END IF;
  IF has_function_privilege('anon',v_fn,'execute')

     OR NOT has_function_privilege('authenticated',v_fn,'execute') THEN
    RAISE EXCEPTION 'DC-06.04 analytics RPC execute grants are too broad or incomplete';
  END IF;
  IF has_table_privilege('authenticated','public.staynas_distribution_operation_ledger','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_operation_attempts','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_outbox','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_webhook_inbox','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_reservation_links','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_health_checks','select') THEN
    RAISE EXCEPTION 'DC-06.04 must not grant direct authenticated reads on service-only operational distribution ledgers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.staynas_distribution_financial_evidence'::regclass AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staynas_distribution_financial_evidence'
       AND policyname='staynas_distribution_financial_evidence_finance_active_property_read') THEN
    RAISE EXCEPTION 'DC-06.04 must preserve DC-06.03 finance-only RLS access to financial evidence';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_fn AND pg_get_functiondef(p.oid) LIKE '%staynas_active_property_id%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_fn AND pg_get_functiondef(p.oid) LIKE '%staynas_user_has_property_access%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_fn AND pg_get_functiondef(p.oid) LIKE '%has_any_role%') THEN
    RAISE EXCEPTION 'DC-06.04 RPC must validate active-property membership and authorized role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_fn AND pg_get_functiondef(p.oid) LIKE '%financialEvidenceIsPayment%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_fn AND pg_get_functiondef(p.oid) LIKE '%readOnly%') THEN
    RAISE EXCEPTION 'DC-06.04 projection semantics must preserve read-only and finance-evidence separation';
  END IF;
END $$;
