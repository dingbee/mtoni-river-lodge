"""CI-only compatibility for a pre-existing optional function revoke.

The live UAT database has public.email_queue_wake(), but the repository's
historical migrations do not define it. The revoke is therefore conditional:
preserve it when the helper exists, skip it on clean local resets when absent.
This script edits only the ephemeral GitHub Actions checkout, never a deployed DB.
"""
from pathlib import Path

migration = Path(
    "supabase/migrations/20260717165915_502a5d15-5ae0-4c00-891f-9fc34da9820b.sql"
)
source = migration.read_text()
old = "REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;"
new = """DO $ci$
BEGIN
  IF to_regprocedure('public.email_queue_wake()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated';
  END IF;
END
$ci$;"""
if old not in source:
    raise SystemExit("Expected legacy optional revoke was not found; inspect migration drift.")
migration.write_text(source.replace(old, new, 1))
