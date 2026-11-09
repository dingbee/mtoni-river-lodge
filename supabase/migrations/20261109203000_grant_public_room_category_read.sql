-- Public guest booking reads room category metadata through the service-role
-- PostgREST relationship embedded in the rooms catalogue query.
-- Grant only SELECT; category writes remain governed by authenticated staff flows.
grant select on table public.room_categories to service_role;
