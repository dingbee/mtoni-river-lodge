-- Post-migration assertions run only against the ephemeral PostgreSQL service.
DO $$
DECLARE
  policy_count integer;
  search_path_count integer;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policies WHERE schemaname IN ('public','storage');
  IF policy_count <> 89 THEN
    RAISE EXCEPTION 'Expected 89 staged policies, found %', policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_logs' AND column_name='property_id'
  ) THEN RAISE EXCEPTION 'activity_logs.property_id was not added'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(has_any_role|has_role|is_any_staff|is_staff|current_user_roles)\\s*\\('
  ) THEN RAISE EXCEPTION 'A staged RLS policy still calls a legacy global-role helper'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='user_roles'
      AND t.tgname='staynas_user_role_property_bootstrap' AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION 'Legacy global-role bootstrap trigger remains'; END IF;

  IF has_function_privilege('anon','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Property access helper grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.staynas_current_property_role()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_current_property_role()','EXECUTE')
  THEN RAISE EXCEPTION 'Current property role helper grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.is_staynas_founder_ai_admin()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.is_staynas_founder_ai_admin()','EXECUTE')
  THEN RAISE EXCEPTION 'Founder helper grants are incorrect'; END IF;

  IF has_function_privilege('authenticated','public.staynas_property_is_operational(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_property_is_operational(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Property lifecycle helper grants are incorrect'; END IF;

  IF has_function_privilege('authenticated','public.has_any_role(uuid,app_role[])','EXECUTE')
     OR has_function_privilege('authenticated','public.has_role(uuid,app_role)','EXECUTE')
     OR has_function_privilege('authenticated','public.is_any_staff(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.is_staff(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.current_user_roles()','EXECUTE')
  THEN RAISE EXCEPTION 'Legacy global-role helper remains executable by authenticated clients'; END IF;

  IF has_function_privilege('authenticated','public.save_room_type_configuration(uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Legacy global-role room configuration overload remains executable'; END IF;

  IF NOT has_function_privilege('authenticated','public.save_room_type_configuration(uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Property-scoped room configuration overload is not executable by authenticated staff'; END IF;

  SELECT count(*) INTO search_path_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('housekeeping_checklist_template','housekeeping_list_notifications','housekeeping_mark_notification_read','enforce_room_category_property')
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'];
  IF search_path_count <> 4 THEN RAISE EXCEPTION 'Expected four pinned search_path functions, found %', search_path_count; END IF;
END $$;

-- Seed synthetic tenant data in the ephemeral database only.
INSERT INTO auth.users(id) VALUES
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002');
INSERT INTO public.staynas_organisations(id,slug,name,status,created_at,updated_at) VALUES
 ('20000000-0000-0000-0000-000000000001','cc01-org-a','CC01 Test Org A','active',now(),now()),
 ('20000000-0000-0000-0000-000000000002','cc01-org-b','CC01 Test Org B','active',now(),now());
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,timezone,currency,status,created_at,updated_at) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','cc01-property-a','CC01-A','CC01 Test Property A','Africa/Dar_es_Salaam','TZS','active',now(),now()),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','cc01-property-b','CC01-B','CC01 Test Property B','Africa/Dar_es_Salaam','TZS','active',now(),now());
INSERT INTO public.staynas_property_members(property_id,user_id,role,status,created_at,updated_at) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner','active',now(),now()),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','finance','active',now(),now()),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','housekeeping','active',now(),now());
INSERT INTO public.staynas_user_property_context(user_id,property_id,updated_at) VALUES
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',now()),
 ('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',now());
INSERT INTO public.staynas_platform_admins(user_id,created_at) VALUES
 ('10000000-0000-0000-0000-000000000001',now());

-- Authenticated owner: own-property access, multi-role resolution, founder authority,
-- and denial of cross-user membership probing.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF NOT public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Owner cannot access own property';
  END IF;
  IF public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Authenticated user can probe another user membership';
  END IF;
  IF public.staynas_current_property_roles() <> ARRAY['finance','owner']::text[] THEN
    RAISE EXCEPTION 'Multi-role property membership was not preserved';
  END IF;
  IF NOT public.is_staynas_founder_ai_admin() THEN
    RAISE EXCEPTION 'Founder registry did not grant founder authority';
  END IF;
END $$;
ROLLBACK;

-- Housekeeping: own-property access is allowed, cross-property access and founder
-- authority are denied.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF NOT public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Housekeeping cannot access own property';
  END IF;
  IF public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Housekeeping can probe another user membership';
  END IF;
  IF public.is_staynas_founder_ai_admin() THEN
    RAISE EXCEPTION 'Housekeeping incorrectly received founder authority';
  END IF;
END $$;
ROLLBACK;

-- Trusted service-role workflow can check another user's property membership.
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL request.jwt.claim.sub='';
DO $$
BEGIN
  IF NOT public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Service role cannot resolve another user membership';
  END IF;
END $$;
ROLLBACK;

-- Lifecycle suspension closes property access.
UPDATE public.staynas_properties SET status='suspended' WHERE id='30000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Suspended property membership remained active';
  END IF;
  IF public.staynas_property_is_operational('30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Suspended property remained operational';
  END IF;
END $$;

SELECT 'CC-01 PostgreSQL migration validation passed' AS result;
