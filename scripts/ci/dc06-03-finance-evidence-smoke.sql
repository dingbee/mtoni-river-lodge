\set ON_ERROR_STOP on
DO $$
DECLARE
  v_rls boolean;
  v_policy text;
BEGIN
  IF to_regclass('public.staynas_distribution_financial_evidence') IS NULL THEN
    RAISE EXCEPTION 'DC-06.03 provider financial evidence table missing';
  END IF;
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c WHERE c.oid='public.staynas_distribution_financial_evidence'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'DC-06.03 RLS is not enabled'; END IF;

  IF has_table_privilege('anon','public.staynas_distribution_financial_evidence','select')
     OR NOT has_table_privilege('authenticated','public.staynas_distribution_financial_evidence','select')
     OR has_table_privilege('authenticated','public.staynas_distribution_financial_evidence','insert')
     OR has_table_privilege('authenticated','public.staynas_distribution_financial_evidence','update')
     OR has_table_privilege('authenticated','public.staynas_distribution_financial_evidence','delete')
     OR has_table_privilege('service_role','public.staynas_distribution_financial_evidence','update')
     OR has_table_privilege('service_role','public.staynas_distribution_financial_evidence','delete') THEN
    RAISE EXCEPTION 'DC-06.03 financial evidence grants are too broad or incomplete';
  END IF;

  SELECT qual INTO v_policy FROM pg_policies
  WHERE schemaname='public'
    AND tablename='staynas_distribution_financial_evidence'
    AND policyname='staynas_distribution_financial_evidence_finance_active_property_read';
  IF v_policy IS NULL
     OR position('staynas_active_property_id' in v_policy)=0
     OR position('staynas_user_has_property_access' in v_policy)=0
     OR position('has_any_role' in v_policy)=0
     OR position('finance' in v_policy)=0 THEN
    RAISE EXCEPTION 'DC-06.03 finance active-property RLS policy is missing or incomplete';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='staynas_distribution_financial_evidence'
      AND policyname='staynas_distribution_financial_evidence_property_read') THEN
    RAISE EXCEPTION 'Broader DC-05.07 property-only evidence policy was not removed';
  END IF;

  IF NOT has_table_privilege('service_role','public.staynas_distribution_financial_evidence','insert') THEN
    RAISE EXCEPTION 'Provider finance worker lost evidence insert permission';
  END IF;
END $$;
