begin;
-- The full Concierge integrity fixture runs in its dedicated isolated PostgreSQL workflow.
-- Keep this Supabase pgTAP entrypoint valid without recreating Supabase-managed roles.
select plan(0);
select * from finish();
rollback;
