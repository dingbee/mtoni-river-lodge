begin;

select plan(2);

select ok(
  has_table_privilege('service_role', 'public.room_categories', 'SELECT'),
  'service_role can read room category metadata for the public booking catalogue'
);

select ok(
  not has_table_privilege('service_role', 'public.room_categories', 'INSERT')
  and not has_table_privilege('service_role', 'public.room_categories', 'UPDATE')
  and not has_table_privilege('service_role', 'public.room_categories', 'DELETE'),
  'public booking catalogue grant does not permit category writes'
);

select * from finish();
rollback;
