-- SPE-04.07.01 — public discovery contract
BEGIN;
SELECT plan(8);
SELECT has_function('public','discover_staynas_public_rate_plans',
  ARRAY['uuid','uuid','date','date','integer','integer','integer'],
  'Guest-safe rate-plan discovery function exists');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid=
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure),
  'Discovery executes with controlled SECURITY DEFINER privileges');
SELECT ok(NOT has_function_privilege('anon',
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)','EXECUTE'),
  'Anonymous role cannot call the internal discovery RPC directly');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)','EXECUTE'),
  'Authenticated role cannot call the internal discovery RPC directly');
SELECT ok(pg_get_functiondef(
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure
  ) LIKE '%resolve_staynas_published_room_pricing%',
  'Discovery reuses the authoritative pricing resolver for eligibility');
SELECT ok(pg_get_functiondef(
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure
  ) LIKE '%staynas_rate_plan_room_types%',
  'Discovery enforces property-scoped room-type assignment');
SELECT ok(pg_get_functiondef(
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure
  ) LIKE '%publication_number DESC%',
  'Discovery uses only the latest immutable publication');
SELECT ok(pg_get_functiondef(
  'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure
  ) NOT LIKE '%rate_plan_data%',
  'Discovery does not expose mutable internal plan configuration');
SELECT * FROM finish();
ROLLBACK;
