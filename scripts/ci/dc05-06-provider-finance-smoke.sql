\set ON_ERROR_STOP on
DO $$
DECLARE
  v_rls boolean;
BEGIN
  IF to_regclass('public.staynas_distribution_financial_evidence') IS NULL THEN
    RAISE EXCEPTION 'DC-05.06 financial evidence table missing';
  END IF;
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c WHERE c.oid='public.staynas_distribution_financial_evidence'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'DC-05.06 RLS is not enabled'; END IF;
  IF has_table_privilege('anon','public.staynas_distribution_financial_evidence','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_financial_evidence','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_financial_evidence','insert')
     OR has_table_privilege('service_role','public.staynas_distribution_financial_evidence','update')
     OR has_table_privilege('service_role','public.staynas_distribution_financial_evidence','delete') THEN
    RAISE EXCEPTION 'DC-05.06 financial evidence table grants are too broad';
  END IF;
  IF NOT has_table_privilege('service_role','public.staynas_distribution_financial_evidence','insert') THEN
    RAISE EXCEPTION 'DC-05.06 service role cannot insert evidence';
  END IF;
  IF has_function_privilege('anon','public.staynas_claim_distribution_finance_webhook(text,integer)','execute')
     OR has_function_privilege('authenticated','public.staynas_claim_distribution_finance_webhook(text,integer)','execute')
     OR NOT has_function_privilege('service_role','public.staynas_claim_distribution_finance_webhook(text,integer)','execute')
     OR has_function_privilege('anon','public.staynas_record_distribution_financial_evidence(uuid,uuid,text,text,text,text,text,jsonb,text)','execute')
     OR has_function_privilege('authenticated','public.staynas_record_distribution_financial_evidence(uuid,uuid,text,text,text,text,text,jsonb,text)','execute')
     OR NOT has_function_privilege('service_role','public.staynas_record_distribution_financial_evidence(uuid,uuid,text,text,text,text,text,jsonb,text)','execute') THEN
    RAISE EXCEPTION 'DC-05.06 RPC grants are invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='staynas_distribution_financial_evidence_reference_uidx') THEN
    RAISE EXCEPTION 'DC-05.06 provider reference idempotency index missing';
  END IF;
END $$;
