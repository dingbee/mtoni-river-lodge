begin;

select plan(11);

select has_table(
  'public',
  'staynas_guest_portal_access_events',
  'guest portal access audit events table exists'
);

select has_column(
  'public',
  'staynas_guest_portal_access',
  'status',
  'credential lifecycle status is stored on the existing access row'
);

select has_column(
  'public',
  'staynas_properties',
  'guest_portal_checkout_time',
  'property checkout policy is configurable'
);

select has_column(
  'public',
  'staynas_properties',
  'guest_portal_grace_minutes',
  'property post-checkout grace is configurable'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.staynas_guest_portal_access_events'::regclass),
  'access event table enforces row level security'
);

select ok(
  not has_table_privilege('anon', 'public.staynas_guest_portal_access_events', 'SELECT'),
  'anonymous role cannot read access event history'
);

select ok(
  not has_table_privilege('authenticated', 'public.staynas_guest_portal_access_events', 'SELECT'),
  'authenticated role cannot read access event history directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)',
    'EXECUTE'
  ),
  'anonymous role cannot issue guest credentials'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated role cannot invoke credential issuance RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)',
    'EXECUTE'
  ),
  'only trusted server-side service role can invoke issuance RPC'
);

select has_index(
  'public',
  'staynas_guest_portal_access',
  'staynas_guest_portal_access_one_active_identity_uidx',
  'one active credential per booking guest identity is enforced'
);

select * from finish();
rollback;
