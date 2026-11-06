-- SPE-04.09 — guest-safe pricing explanation contract.
BEGIN;
SELECT plan(6);

SELECT has_function('public','discover_staynas_public_rate_plans',
  ARRAY['uuid','uuid','date','date','integer','integer','integer'],
  'Public rate-plan discovery remains available through the controlled server function');

SELECT ok(
  pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%nightly_breakdown%'
    AND pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%source_label%',
  'Discovery exposes a nightly breakdown with a human-readable source explanation');

SELECT ok(
  pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    NOT LIKE '%source_id%'
    AND pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    NOT LIKE '%source_key%'
    AND pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    NOT LIKE '%snapshot_hash%',
  'Guest-facing pricing explanation excludes internal source identifiers and snapshot hashes');

SELECT ok(
  pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%_check_out-1%',
  'Plan eligibility treats checkout as exclusive and includes the final charged night');

SELECT ok(
  NOT has_function_privilege('anon',
    'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)','EXECUTE')
    AND NOT has_function_privilege('authenticated',
    'public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)','EXECUTE'),
  'Discovery remains restricted to the service role');

SELECT ok(
  pg_get_functiondef('public.discover_staynas_public_rate_plans(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%resolve_staynas_published_room_pricing%',
  'Nightly explanations are derived from the authoritative pricing resolver');

SELECT * FROM finish();
ROLLBACK;
