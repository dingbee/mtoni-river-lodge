-- Post-migration assertions run only against the ephemeral PostgreSQL service.
DO $$
DECLARE
  policy_count integer;
  search_path_count integer;
  internal_exposed text;
  public_definer_list text;
  missing_public_endpoints text;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policies WHERE schemaname IN ('public','storage');
  IF policy_count <> 85 THEN
    RAISE EXCEPTION 'Expected 85 final staged policies, found %', policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_logs' AND column_name='property_id'
  ) THEN RAISE EXCEPTION 'activity_logs.property_id was not added'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(has_any_role|has_role|is_any_staff|is_staff|current_user_roles)[[:space:]]*[(]'
  ) THEN RAISE EXCEPTION 'A staged RLS policy still calls a legacy global-role helper'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='user_roles'
      AND t.tgname='staynas_user_role_property_bootstrap' AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION 'Legacy global-role bootstrap trigger remains'; END IF;

  -- Reject any anonymous overload outside the exact public booking signature set.
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid))
  INTO public_definer_list
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND has_function_privilege('anon',p.oid,'EXECUTE')
    AND p.proname = ANY(ARRAY[
      'create_booking_for_property','create_booking_hold_for_property',
      'get_booking_hold_for_property','get_room_availability_for_property',
      'release_booking_hold_for_property','staynas_booking_property_id'
    ])
    AND p.oid <> ALL(ARRAY[
      'public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)'::regprocedure,
      'public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure,
      'public.create_booking_hold_for_property(uuid,text,date,date,text,text,integer)'::regprocedure,
      'public.get_booking_hold_for_property(uuid,uuid,text)'::regprocedure,
      'public.get_room_availability_for_property(uuid,date,date)'::regprocedure,
      'public.release_booking_hold_for_property(uuid,uuid,text)'::regprocedure,
      'public.staynas_booking_property_id()'::regprocedure
    ]);
  IF public_definer_list IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected anonymous booking SECURITY DEFINER overloads: %', public_definer_list;
  END IF;

  IF NOT has_function_privilege('anon','public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('anon','public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('anon','public.create_booking_hold_for_property(uuid,text,date,date,text,text,integer)','EXECUTE')
     OR NOT has_function_privilege('anon','public.release_booking_hold_for_property(uuid,uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Required public booking RPC signature is not anonymously executable'; END IF;

  -- Exact RPC signature grants: no implicit PUBLIC execution or accidental overloads.
  IF NOT has_function_privilege('anon','public.staynas_booking_property_id()','EXECUTE')
     OR has_function_privilege('anon','public.staynas_booking_property_id(text)','EXECUTE')
     OR has_function_privilege('authenticated','public.staynas_booking_property_id(text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_booking_property_id()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_booking_property_id()','EXECUTE')
  THEN RAISE EXCEPTION 'Booking property resolver signature/grants are incorrect'; END IF;

  IF NOT has_function_privilege('anon','public.get_room_availability_for_property(uuid,date,date)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_room_availability_for_property(uuid,date,date)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_room_availability_for_property(uuid,date,date)','EXECUTE')
  THEN RAISE EXCEPTION 'Property availability RPC grants are incorrect'; END IF;

  IF NOT has_function_privilege('anon','public.get_booking_hold_for_property(uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_booking_hold_for_property(uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_booking_hold_for_property(uuid,uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Property hold lookup RPC grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.release_booking_hold(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Legacy unscoped booking RPC remains anonymously executable'; END IF;

  IF has_function_privilege('anon','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Property access helper grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.staynas_ai_property_in_active_context(uuid,app_role[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_ai_property_in_active_context(uuid,app_role[])','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_ai_property_in_active_context(uuid,app_role[])','EXECUTE')
  THEN RAISE EXCEPTION 'AI active-property helper grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.housekeeping_is_supervisor(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.housekeeping_is_supervisor(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.housekeeping_is_supervisor(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Housekeeping supervisor helper grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.checkin_eligibility_for_property(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.checkin_eligibility_for_property(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.checkin_eligibility_for_property(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Property-scoped check-in eligibility grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid)','EXECUTE')
     OR position('staynas_current_user_has_property_role' in pg_get_functiondef('public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid)'::regprocedure)) = 0
  THEN RAISE EXCEPTION 'Staff create_booking role guard or grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.reassign_booking_room(uuid,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.reassign_booking_room(uuid,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.reassign_booking_room(uuid,uuid,uuid,text)','EXECUTE')
     OR position('staynas_current_user_has_property_role' in pg_get_functiondef('public.reassign_booking_room(uuid,uuid,uuid,text)'::regprocedure)) = 0
     OR position('property_id IS DISTINCT FROM' in pg_get_functiondef('public.reassign_booking_room(uuid,uuid,uuid,text)'::regprocedure)) = 0
  THEN RAISE EXCEPTION 'Room reassignment property/role guard or grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.staynas_active_property_id(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_active_property_id(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.staynas_active_property_id(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Active-property resolver grants are incorrect'; END IF;

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

  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  INTO internal_exposed
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname = ANY(ARRAY[
      'bookings_link_guest','hk_exception_events','hk_inspection_events',
      'hk_room_state_events','hk_task_events','staynas_enforce_hold_property',
      'staynas_enforce_ops_task_property','staynas_set_guest_child_property',
      'arrival_pass_validate_unscoped','checkin_eligibility',
      'current_user_roles','checkin_log_activity',
      'checkin_sync_reservation','log_calendar_event','is_guest_pii_staff',
      'restaurant_is_platform_admin'
    ])
    AND (has_function_privilege('anon',p.oid,'EXECUTE')
         OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
  IF internal_exposed IS NOT NULL THEN
    RAISE EXCEPTION 'Internal SECURITY DEFINER functions remain client-executable: %', internal_exposed;
  END IF;

  SELECT count(*), string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid))
  INTO policy_count, public_definer_list
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND has_function_privilege('anon',p.oid,'EXECUTE')
    AND p.proname <> ALL(ARRAY[
      'create_booking_for_property','create_booking_hold_for_property',
      'get_booking_hold_for_property','get_room_availability_for_property',
      'release_booking_hold_for_property','staynas_booking_property_id',
      'arrival_pass_ensure','arrival_pass_fetch','checkin_fetch_summary',
      'checkin_save_draft','checkin_submit','checkin_verify'
    ]);
  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected anonymous SECURITY DEFINER functions remain outside the guest/booking allowlist: %', public_definer_list;
  END IF;

  SELECT string_agg(required.name, ', ' ORDER BY required.name)
  INTO missing_public_endpoints
  FROM unnest(ARRAY[
    'create_booking_for_property','create_booking_hold_for_property',
    'get_booking_hold_for_property','get_room_availability_for_property',
    'release_booking_hold_for_property','staynas_booking_property_id',
    'arrival_pass_ensure','arrival_pass_fetch','checkin_fetch_summary',
    'checkin_save_draft','checkin_submit','checkin_verify'
  ]) required(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=required.name
      AND has_function_privilege('anon',p.oid,'EXECUTE')
  );
  IF missing_public_endpoints IS NOT NULL THEN
    RAISE EXCEPTION 'Intended public booking/check-in endpoints lost anonymous execution: %', missing_public_endpoints;
  END IF;

  IF has_function_privilege('anon','public.restaurant_can_read(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.restaurant_can_read(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.restaurant_can_read(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Restaurant read predicate grants are incorrect'; END IF;

  IF has_function_privilege('anon','public.restaurant_can_write(uuid,restaurant_role[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.restaurant_can_write(uuid,restaurant_role[])','EXECUTE')
     OR NOT has_function_privilege('service_role','public.restaurant_can_write(uuid,restaurant_role[])','EXECUTE')
  THEN RAISE EXCEPTION 'Restaurant write predicate grants are incorrect'; END IF;

  IF has_function_privilege('authenticated','public.save_room_type_configuration(uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Legacy global-role room configuration overload remains executable'; END IF;

  IF NOT has_function_privilege('authenticated','public.save_room_type_configuration(uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Property-scoped room configuration overload is not executable by authenticated staff'; END IF;

  SELECT count(*) INTO search_path_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('housekeeping_checklist_template','housekeeping_list_notifications','housekeeping_mark_notification_read','enforce_room_category_property')
    AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%');
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
INSERT INTO public.staynas_booking_config(id,property_id) VALUES (true,'30000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO UPDATE SET property_id=EXCLUDED.property_id;

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
  IF public.staynas_active_property_id('10000000-0000-0000-0000-000000000001') <> '30000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'Owner active-property resolution failed';
  END IF;
  IF NOT public.staynas_ai_property_in_active_context('30000000-0000-0000-0000-000000000001', ARRAY['owner']::public.app_role[]) THEN
    RAISE EXCEPTION 'Owner AI access to active property failed';
  END IF;
  IF public.staynas_active_property_id('10000000-0000-0000-0000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'Authenticated user can resolve another user active property';
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
  IF public.staynas_active_property_id('10000000-0000-0000-0000-000000000002') <> '30000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'Service role cannot resolve another user''s active property';
  END IF;
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

-- Trusted service-role workflow can check another user''s property membership.
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

-- Organisation suspension must also close AI/property access.
UPDATE public.staynas_organisations SET status='suspended' WHERE id='20000000-0000-0000-0000-000000000001';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF public.staynas_ai_property_in_active_context('30000000-0000-0000-0000-000000000001', ARRAY['owner']::public.app_role[]) THEN
    RAISE EXCEPTION 'Suspended organisation retained AI property access';
  END IF;
  IF public.staynas_active_property_id('10000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'Suspended organisation retained active-property resolution';
  END IF;
END $$;
ROLLBACK;
UPDATE public.staynas_organisations SET status='active' WHERE id='20000000-0000-0000-0000-000000000001';

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

-- Non-active lifecycle states must all fail closed, not only "suspended".
UPDATE public.staynas_properties SET status='inactive' WHERE id='30000000-0000-0000-0000-000000000002';
DO $
BEGIN
  IF public.staynas_user_has_property_access('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Inactive property retained membership access';
  END IF;
  IF public.staynas_current_user_has_property_role('30000000-0000-0000-0000-000000000002', ARRAY['housekeeping']::public.app_role[]) THEN
    RAISE EXCEPTION 'Inactive property retained role authorization';
  END IF;
END $;
UPDATE public.staynas_properties SET status='active' WHERE id='30000000-0000-0000-0000-000000000002';

SELECT 'CC-01 PostgreSQL migration validation passed' AS result;
