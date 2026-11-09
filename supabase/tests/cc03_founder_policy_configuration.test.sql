-- Founder-managed policy configuration authorization, persistence and audit tests.
-- Runs after the CC-03 lifecycle and founder-policy configuration migrations.
BEGIN;
SELECT plan(1);
SELECT lives_ok($body$
DO $test$
DECLARE
  v_user uuid := '71000000-0000-4000-8000-000000000001';
  v_tenant_user uuid := '71000000-0000-4000-8000-000000000002';
  v_org uuid := '72000000-0000-4000-8000-000000000001';
  v_property uuid := '73000000-0000-4000-8000-000000000001';
  v_tenant_org uuid := '72000000-0000-4000-8000-000000000002';
  v_tenant_property uuid := '73000000-0000-4000-8000-000000000002';
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.commercial_policy_config_versions'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Policy configuration table must have RLS and FORCE RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.commercial_policy_config_versions', 'SELECT')
    OR has_table_privilege('authenticated', 'public.commercial_policy_config_versions', 'SELECT')
    OR has_table_privilege('authenticated', 'public.commercial_policy_config_versions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.commercial_policy_config_versions', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.commercial_policy_config_versions', 'DELETE')
    OR has_table_privilege('service_role', 'public.commercial_policy_config_versions', 'INSERT')
    OR has_table_privilege('service_role', 'public.commercial_policy_config_versions', 'UPDATE')
    OR has_table_privilege('service_role', 'public.commercial_policy_config_versions', 'DELETE') THEN
    RAISE EXCEPTION 'Policy configuration table grants are not least-privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.commercial_policy_config_current'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Current published policy pointer must have RLS and FORCE RLS enabled';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.commercial_policy_config_versions', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.commercial_policy_config_current', 'SELECT')
    OR has_table_privilege('authenticated', 'public.commercial_policy_config_current', 'SELECT') THEN
    RAISE EXCEPTION 'Trusted server read access or client isolation is incorrect';
  END IF;

  IF has_function_privilege('anon', 'public.commercial_record_policy_config(text,integer,text,jsonb,date,date)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.commercial_record_policy_config(text,integer,text,jsonb,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Policy write RPC grants are not least-privilege';
  END IF;

  INSERT INTO auth.users(id) VALUES (v_user), (v_tenant_user);
  INSERT INTO public.staynas_organisations(id, slug, name)
  VALUES (v_org, 'cc03-policy-founder', 'CC03 Policy Founder'),
         (v_tenant_org, 'cc03-policy-tenant', 'CC03 Policy Tenant');
  INSERT INTO public.staynas_properties(id, organisation_id, slug, code, name, status, currency)
  VALUES (v_property, v_org, 'cc03-policy-founder-property', 'CC03PF', 'Founder Property', 'active'),
         (v_tenant_property, v_tenant_org, 'cc03-policy-tenant-property', 'CC03PT', 'Tenant Property', 'active','TZS');
  INSERT INTO public.staynas_property_members(property_id, user_id, status, role)
  VALUES (v_property, v_user, 'active', 'owner'),
         (v_tenant_property, v_tenant_user, 'active', 'owner');
  INSERT INTO public.commercial_founder_tenant_config(singleton, founder_organisation_id)
  VALUES (true, v_org);
  INSERT INTO public.commercial_founder_admin_memberships(principal_id, organisation_id, status, verified_at)
  VALUES (v_user, v_org, 'active', now());

  -- A verified founder may append a version; policy and audit evidence are atomic.
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;
  v_id := public.commercial_record_policy_config(
    'trial_policy', 1, 'published',
    '[{"planCode":"professional","planVersion":1,"policyVersion":1,"enabled":true,"durationDays":14,"startTrigger":"subscription_activated","effectiveFrom":null,"effectiveTo":null}]'::jsonb,
    NULL, NULL
  );
  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_policy_config_versions
    WHERE id = v_id AND policy_type = 'trial_policy'
      AND version = 1 AND status = 'published'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commercial_policy_config_current
    WHERE policy_type = 'trial_policy' AND version_id = v_id
      AND published_by = v_user
  ) THEN
    RAISE EXCEPTION 'Founder policy configuration or current published pointer was not persisted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_audit_events
    WHERE resource_ref = v_id::text
      AND action = 'commercial_policy_config.created'
      AND actor_user_id = v_user
      AND actor_role = 'founder_admin'
      AND outcome = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'Founder policy write did not persist its audit evidence';
  END IF;

  -- Tenant administrator cannot write global commercial policy configuration.
  PERFORM set_config('request.jwt.claim.sub', v_tenant_user::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.commercial_record_policy_config(
      'trial_policy', 2, 'published', '[]'::jsonb, NULL, NULL
    );
    RAISE EXCEPTION 'Tenant policy write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  -- Versions are immutable; edits require a new version.
  BEGIN
    UPDATE public.commercial_policy_config_versions
    SET payload = '[]'::jsonb WHERE id = v_id;
    RAISE EXCEPTION 'Policy version update unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.commercial_policy_config_versions WHERE id = v_id;
    RAISE EXCEPTION 'Policy version deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END;
$test$;
$body$, 'CC-03 founder policy configuration authorization and audit contract executes without exceptions');
SELECT * FROM finish();
ROLLBACK;
