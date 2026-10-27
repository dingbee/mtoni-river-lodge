-- Enable RLS on public base tables that have no direct anon/authenticated CRUD grants.
-- Tables that require browser access must receive explicit, table-specific policies in a separate reviewed migration.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = n.nspname
          AND g.table_name = c.relname
          AND g.grantee IN ('anon', 'authenticated')
          AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schema_name, t.table_name);
  END LOOP;
END
$$;
