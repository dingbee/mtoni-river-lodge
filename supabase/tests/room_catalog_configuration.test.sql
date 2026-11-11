begin;
select plan(11);
select ok(
  to_regprocedure('public.save_platform_room_type_configuration(uuid,uuid,text,text,uuid,text,text,text,text[],jsonb,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text,text[])') is not null,
  'atomic room configuration RPC is installed'
);
select ok(
  not has_table_privilege('anon','public.rooms','SELECT'),
  'anonymous role cannot directly read rooms'
);
select ok(
  not has_table_privilege('anon','public.room_categories','SELECT'),
  'anonymous role cannot directly read room categories'
);
select ok(
  has_function_privilege('authenticated','public.save_platform_room_type_configuration(uuid,uuid,text,text,uuid,text,text,text,text[],jsonb,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text,text[])','EXECUTE'),
  'authenticated role can invoke the manager-authorized atomic room RPC'
);
select ok(
  not has_function_privilege('anon','public.save_platform_room_type_configuration(uuid,uuid,text,text,uuid,text,text,text,text[],jsonb,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text,text[])','EXECUTE'),
  'anonymous role cannot invoke room configuration RPC'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='rooms' and policyname='Property members read active rooms'),
  'room reads are property-member scoped'
);
select ok(
  not has_table_privilege('authenticated','public.rooms','INSERT'),
  'authenticated users cannot bypass the atomic room configuration RPC'
);
select ok(
  has_table_privilege('authenticated','public.room_categories','INSERT'),
  'authenticated room managers can create property categories through RLS'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='room_categories' and policyname='Room admins manage own property categories' and qual like '%staynas_property_members%'),
  'category writes require a property-scoped manager membership'
);
select ok(
  not has_table_privilege('authenticated','public.rooms','TRUNCATE'),
  'authenticated users cannot truncate physical room inventory definitions'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.save_platform_room_type_configuration(uuid,uuid,text,text,uuid,text,text,text,text[],jsonb,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text,text[])')) like '%SKIP LOCKED%',
  'physical room reductions serialize against concurrent room-state updates'
);
select * from finish();
rollback;
