-- CC-03.06 privilege hardening regression test.
BEGIN;
SELECT plan(1);
SELECT lives_ok($body$
DO $test$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'commercial_accounts',
    'commercial_subscriptions',
    'commercial_founder_tenant_config',
    'commercial_founder_admin_memberships',
    'commercial_trial_claims',
    'commercial_subscription_events',
    'commercial_audit_events'
  ] LOOP
    IF has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'service_role must not have direct DELETE privilege on public.%', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS must be enabled and forced on public.%', v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.commercial_accounts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.commercial_accounts', 'SELECT') THEN
    RAISE EXCEPTION 'Browser roles must not directly read commercial account tables';
  END IF;
END;
$test$;
$body$, 'CC-03 privilege hardening regression executes without exceptions');
SELECT * FROM finish();
ROLLBACK;
