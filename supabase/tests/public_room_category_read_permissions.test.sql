begin;

select plan(1);

select ok(
  has_table_privilege('service_role', 'public.room_categories', 'SELECT'),
  'service_role can read room category metadata for the public booking catalogue'
);

select * from finish();
rollback;
