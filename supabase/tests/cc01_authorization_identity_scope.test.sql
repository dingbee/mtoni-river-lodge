-- CC-01 authorization identity-scope regression contracts.
BEGIN;
SELECT plan(21);

SELECT ok(
  position('auth.uid() IS DISTINCT FROM _user_id' in pg_get_functiondef('public.has_role(uuid,public.app_role)'::regprocedure)) > 0,
  'has_role rejects cross-user role probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _user_id' in pg_get_functiondef('public.has_any_role(uuid,public.app_role[])'::regprocedure)) > 0,
  'has_any_role rejects cross-user role probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _user_id' in pg_get_functiondef('public.is_any_staff(uuid)'::regprocedure)) > 0,
  'is_any_staff rejects cross-user staff probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _user_id' in pg_get_functiondef('public.is_guest_pii_staff(uuid)'::regprocedure)) > 0,
  'is_guest_pii_staff rejects cross-user PII authorization probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _user_id' in pg_get_functiondef('public.is_staff(uuid)'::regprocedure)) > 0,
  'is_staff rejects cross-user staff probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _uid' in pg_get_functiondef('public.housekeeping_is_supervisor(uuid)'::regprocedure)) > 0,
  'housekeeping supervisor helper rejects cross-user probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _user_id' in pg_get_functiondef('public.restaurant_is_platform_admin(uuid)'::regprocedure)) > 0,
  'restaurant platform-admin helper rejects cross-user probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _uid' in pg_get_functiondef('public.staynas_user_has_property_access(uuid,uuid)'::regprocedure)) > 0,
  'property-membership helper rejects cross-user membership probes'
);
SELECT ok(
  position('auth.uid() IS DISTINCT FROM _uid' in pg_get_functiondef('public.staynas_active_property_id(uuid)'::regprocedure)) > 0,
  'active-property resolver rejects cross-user context reads'
);

SELECT ok(NOT has_function_privilege('anon','public.has_role(uuid,public.app_role)','EXECUTE'),'anon cannot execute has_role');
SELECT ok(NOT has_function_privilege('anon','public.has_any_role(uuid,public.app_role[])','EXECUTE'),'anon cannot execute has_any_role');
SELECT ok(NOT has_function_privilege('anon','public.staynas_user_has_property_access(uuid,uuid)','EXECUTE'),'anon cannot execute property membership helper');
SELECT ok(NOT has_function_privilege('anon','public.staynas_active_property_id(uuid)','EXECUTE'),'anon cannot execute active-property resolver');
SELECT ok(NOT has_function_privilege('anon','public.current_user_roles()','EXECUTE'),'anon cannot execute current_user_roles');
SELECT ok(NOT has_function_privilege('anon','public.restaurant_can_read(uuid)','EXECUTE'),'anon cannot execute restaurant_can_read');
SELECT ok(NOT has_function_privilege('anon','public.restaurant_can_write(uuid,public.restaurant_role[])','EXECUTE'),'anon cannot execute restaurant_can_write');

SELECT ok(NOT has_function_privilege('anon','public.checkin_eligibility(uuid)','EXECUTE'),'anon cannot query check-in eligibility by booking UUID');
SELECT ok(
  has_function_privilege('authenticated','public.checkin_eligibility(uuid)','EXECUTE')
  AND position('staynas_user_has_property_access' in pg_get_functiondef('public.checkin_eligibility(uuid)'::regprocedure)) > 0
  AND position('has_any_role' in pg_get_functiondef('public.checkin_eligibility(uuid)'::regprocedure)) > 0,
  'authenticated check-in eligibility is restricted to staff in the booking property'
);
SELECT ok(
  NOT has_function_privilege('anon','public.checkin_eligibility_internal(uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.checkin_eligibility_internal(uuid)','EXECUTE'),
  'private check-in eligibility primitive is not client-executable'
);
SELECT ok(
  position('checkin_eligibility_internal' in pg_get_functiondef('public.checkin_fetch_summary(text)'::regprocedure)) > 0
  AND position('checkin_eligibility_internal' in pg_get_functiondef('public.checkin_submit(text,text,jsonb,jsonb,boolean,text,jsonb)'::regprocedure)) > 0
  AND position('checkin_eligibility_internal' in pg_get_functiondef('public.checkin_verify(text,text,text)'::regprocedure)) > 0,
  'guest token workflows call the private eligibility primitive after token validation'
);

SELECT ok(
  NOT has_function_privilege('anon','public.bookings_link_guest()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.bookings_link_guest()','EXECUTE')
  AND NOT has_function_privilege('anon','public.hk_task_events()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.hk_task_events()','EXECUTE')
  AND NOT has_function_privilege('anon','public.staynas_set_guest_child_property()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.staynas_set_guest_child_property()','EXECUTE'),
  'trigger-only SECURITY DEFINER functions are not client-executable'
);

SELECT * FROM finish();
ROLLBACK;
