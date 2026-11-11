begin;
-- The full Concierge integrity fixture runs in its dedicated isolated PostgreSQL workflow.
-- This pgTAP entry keeps the Supabase-wide suite from recreating Supabase-managed roles.
select plan(1);
select ok(true, 'isolated Concierge integrity fixture is owned by its dedicated PostgreSQL workflow');
select * from finish();
rollback;
