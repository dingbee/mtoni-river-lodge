-- SPE-04.03 database contract tests. Run with Supabase pgTAP test runner.
BEGIN;
SELECT plan(19);

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
  NOT EXISTS (
    SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamptz)'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
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


SELECT has_function(
  'public',
  'calculate_staynas_room_pricing_legacy',
  ARRAY['uuid','uuid','date','date','integer','integer','integer'],
  'SPE-02 calculator is preserved as the legacy-only implementation'
);

SELECT has_function(
  'public',
  'calculate_staynas_room_pricing',
  ARRAY['uuid','uuid','date','date','integer','integer','integer'],
  'Shared accommodation pricing adapter retains its established signature'
);

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%resolve_staynas_published_room_pricing%',
  'Shared accommodation adapter routes published-plan properties through the SPE-04 resolver'
);

SELECT ok(
  pg_get_functiondef('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamptz)'::regprocedure)
    LIKE '%x.publication_number=%',
  'Implicit plan lookup is constrained to the latest immutable publication'
);

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
    LIKE '%v_room_quote->>''ok''=''false''%',
  'Quote composition propagates structured resolver failures before extras and tax calculation'
);

SELECT ok(
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%StayNas pricing rejected%',
  'Booking creation rejects failed pricing before booking persistence'
);

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%q.quote->>''ok''=''false''%',
  'Availability never marks a structured pricing failure as sellable'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute the shared accommodation adapter'
);


SELECT ok(
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)'::regprocedure)
    LIKE '%''online''%',
  'Legacy 16-argument booking RPC delegates to the shared pricing-aware booking path'
);

SELECT * FROM finish();
ROLLBACK;
