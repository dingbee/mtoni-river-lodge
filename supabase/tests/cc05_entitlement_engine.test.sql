\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  v_founder uuid := '81000000-0000-4000-8000-000000000001';
  v_tenant uuid := '81000000-0000-4000-8000-000000000002';
  v_founder_org uuid := '82000000-0000-4000-8000-000000000001';
  v_tenant_org uuid := '82000000-0000-4000-8000-000000000002';
  v_founder_property uuid := '83000000-0000-4000-8000-000000000001';
  v_tenant_property uuid := '83000000-0000-4000-8000-000000000002';
  v_account uuid := '84000000-0000-4000-8000-000000000001';
  v_subscription uuid := '85000000-0000-4000-8000-000000000001';
  v_rule uuid;
  v_decision uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.commercial_entitlement_grant_rules'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.commercial_entitlement_assignments'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.commercial_entitlement_decisions'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'All CC-05 tables must enforce RLS and FORCE RLS';
  END IF;
  IF has_table_privilege('anon','public.commercial_entitlement_grant_rules','SELECT')
    OR has_table_privilege('authenticated','public.commercial_entitlement_grant_rules','SELECT')
    OR has_table_privilege('authenticated','public.commercial_entitlement_grant_rules','INSERT')
    OR has_table_privilege('service_role','public.commercial_entitlement_grant_rules','INSERT')
    OR has_table_privilege('authenticated','public.commercial_entitlement_assignments','SELECT')
    OR has_table_privilege('authenticated','public.commercial_entitlement_decisions','SELECT')
    OR NOT has_table_privilege('service_role','public.commercial_entitlement_assignments','UPDATE')
    OR NOT has_table_privilege('service_role','public.commercial_entitlement_decisions','INSERT') THEN
    RAISE EXCEPTION 'CC-05 table grants are not least-privilege';
  END IF;
  IF has_function_privilege('anon','public.commercial_record_entitlement_grant(text,uuid,text,text,text,timestamptz,timestamptz,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.commercial_record_entitlement_grant(text,uuid,text,text,text,timestamptz,timestamptz,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.commercial_record_entitlement_decision(uuid,uuid,text,boolean,text,text,text,text,uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commercial_record_entitlement_decision(uuid,uuid,text,boolean,text,text,text,text,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'CC-05 RPC grants are not least-privilege';
  END IF;

  INSERT INTO auth.users(id) VALUES (v_founder),(v_tenant);
  INSERT INTO public.staynas_organisations(id,slug,name,status)
  VALUES (v_founder_org,'cc05-founder','CC05 Founder','active'),
         (v_tenant_org,'cc05-tenant','CC05 Tenant','active');
  INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status,currency)
  VALUES (v_founder_property,v_founder_org,'cc05-founder-property','CC05F','Founder Property','active','TZS'),
         (v_tenant_property,v_tenant_org,'cc05-tenant-property','CC05T','Tenant Property','active','TZS');
  INSERT INTO public.staynas_property_members(property_id,user_id,status,role)
  VALUES (v_founder_property,v_founder,'active','owner'),
         (v_tenant_property,v_tenant,'active','owner');
  INSERT INTO public.commercial_founder_tenant_config(singleton,founder_organisation_id)
  VALUES (true,v_founder_org);
  INSERT INTO public.commercial_founder_admin_memberships(principal_id,organisation_id,status,verified_at)
  VALUES (v_founder,v_founder_org,'active',now());

  INSERT INTO public.commercial_accounts(id,organisation_id,status)
  VALUES (v_account,v_tenant_org,'active');
  INSERT INTO public.commercial_subscriptions(
    id,account_id,plan_code,plan_version,currency,billing_term,property_count,
    addon_codes,price_resolution_ref,accepted_price_snapshot,quote_required,status
  ) VALUES (
    v_subscription,v_account,'professional',1,'TZS','monthly',2,'{}',
    'cc05-test-price','{"currency":"TZS","quoteRequired":false}'::jsonb,false,'pending_activation'
  );

  PERFORM set_config('request.jwt.claim.sub',v_founder::text,true);
  SET LOCAL ROLE authenticated;
  v_rule := public.commercial_record_entitlement_grant(
    'custom_feature',v_tenant_org,NULL,'finance','granted',now()-interval '1 day',NULL,'Approved CC-05 test grant'
  );
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.commercial_entitlement_grant_rules WHERE id=v_rule AND created_by=v_founder) THEN
    RAISE EXCEPTION 'Founder grant rule was not persisted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_tenant::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.commercial_record_entitlement_grant(
      'custom_feature',v_tenant_org,NULL,'finance','granted',now()-interval '1 day',NULL,'Tenant must not grant itself'
    );
    RAISE EXCEPTION 'Tenant unexpectedly created a founder grant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SET LOCAL ROLE service_role;
  v_decision := public.commercial_record_entitlement_decision(
    v_tenant_org,v_subscription,'finance',true,'granted','custom',v_rule::text,
    'Authorized by explicit founder grant',NULL,'{"test":true}'::jsonb
  );
  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_entitlement_assignments
    WHERE subscription_id=v_subscription AND feature_code='finance'
      AND source_type='custom' AND source_ref=v_rule::text AND status='active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commercial_entitlement_decisions
    WHERE id=v_decision AND allowed=true AND outcome='granted'
  ) THEN
    RAISE EXCEPTION 'Durable entitlement assignment or decision was not persisted';
  END IF;

  BEGIN
    UPDATE public.commercial_entitlement_grant_rules SET reason='tampered' WHERE id=v_rule;
    RAISE EXCEPTION 'Grant rule unexpectedly mutable';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE public.commercial_entitlement_decisions SET reason='tampered' WHERE id=v_decision;
    RAISE EXCEPTION 'Entitlement decision unexpectedly mutable';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$test$;
ROLLBACK;
