-- SPE-04.03 database contract tests. Run with Supabase pgTAP test runner.
BEGIN;
SELECT plan(10);

SELECT has_function(
  'public',
  'resolve_staynas_published_room_pricing',
  ARRAY['uuid','uuid','date','date','integer','integer','integer','uuid','timestamp with time zone'],
  'Published-plan resolver exists with an explicit optional plan selector'
);

SELECT function_returns(
  'public',
  'resolve_staynas_published_room_pricing',
  ARRAY['uuid','uuid','date','date','integer','integer','integer','uuid','timestamp with time zone'],
  'jsonb',
  'Resolver returns structured JSON outcomes and nightly evidence'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid =
    'public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamptz)'::regprocedure),
  'Resolver executes with controlled SECURITY DEFINER privileges'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamptz)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute the resolver'
);

SELECT ok(
  NOT has_function_privilege(
    'public',
    'public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamptz)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the resolver'
);

SELECT has_function(
  'public',
  'validate_staynas_rate_plan_base_and_occupancy_data',
  ARRAY[],
  'Canonical base-rate and occupancy validator exists'
);

SELECT has_trigger(
  'public',
  'staynas_rate_plans',
  'staynas_rate_plans_base_occupancy_guard',
  'Base-rate and occupancy validation is enforced on rate-plan writes'
);

SELECT has_trigger(
  'public',
  'staynas_rate_plans',
  'staynas_rate_plans_daily_rates_guard',
  'Daily rate integrity guard remains installed'
);

SELECT has_trigger(
  'public',
  'staynas_rate_plans',
  'staynas_rate_plans_seasonal_rates_guard',
  'Seasonal rate integrity guard remains installed'
);

SELECT ok(
  (SELECT count(*) = 0
   FROM pg_proc p
   WHERE p.proname = 'resolve_staynas_published_room_pricing'
     AND p.prosecdef IS FALSE),
  'No invoker-security duplicate resolver exists'
);

SELECT * FROM finish();
ROLLBACK;
