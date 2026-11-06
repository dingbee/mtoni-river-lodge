"""CI-only compatibility for optional legacy function revokes.

The live UAT database contains helper functions that are not recreated by the
repository's historical migrations. On a clean local reset, revokes for those
optional helpers must be conditional. This edits only the ephemeral GitHub
Actions checkout; it never changes a deployed database or committed migration.
"""
import re
from pathlib import Path

migration = Path(
    "supabase/migrations/20260717165915_502a5d15-5ae0-4c00-891f-9fc34da9820b.sql"
)
source = migration.read_text()
pattern = re.compile(
    r"^REVOKE EXECUTE ON FUNCTION (public\.[^(]+\([^)]*\)) FROM ([^;]+);$",
    re.MULTILINE,
)

def conditional_revoke(match: re.Match[str]) -> str:
    signature, roles = match.groups()
    statement = f"REVOKE EXECUTE ON FUNCTION {signature} FROM {roles}"
    return (
        "DO $ci$ BEGIN "
        f"IF to_regprocedure('{signature}') IS NOT NULL THEN "
        f"EXECUTE '{statement}'; "
        "END IF; END $ci$;"
    )

patched, count = pattern.subn(conditional_revoke, source)
if count < 1:
    raise SystemExit("No legacy function revokes found; inspect migration drift.")
migration.write_text(patched)
