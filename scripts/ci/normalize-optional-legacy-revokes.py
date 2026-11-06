"""CI-only normalization for pre-existing migration drift.

The live UAT database contains helper functions and room records that are not
recreated by the repository's historical migrations. On a clean local reset,
optional function revokes and room-state seed inserts must be conditional.
This edits only the ephemeral GitHub Actions checkout; it never changes a
deployed database or committed migration.
"""
import re
from pathlib import Path

legacy = Path(
    "supabase/migrations/20260717165915_502a5d15-5ae0-4c00-891f-9fc34da9820b.sql"
)
source = legacy.read_text()
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
legacy.write_text(patched)

# This historical data migration extends a room inventory only when that
# production room exists. Clean local CI databases have no property seed data.
room_migration = Path(
    "supabase/migrations/20260721144859_b10a8bc5-70f4-451d-9560-c7a3011c4128.sql"
)
room_source = room_migration.read_text()
old = """  FROM generate_series(13, 21) g
 WHERE NOT EXISTS (
   SELECT 1 FROM public.room_states
    WHERE room_id = '3b476463-ea58-4d5b-abb4-ad460e844a8b'"""
new = """  FROM generate_series(13, 21) g
 WHERE EXISTS (
   SELECT 1 FROM public.rooms
    WHERE id = '3b476463-ea58-4d5b-abb4-ad460e844a8b'
 )
   AND NOT EXISTS (
   SELECT 1 FROM public.room_states
    WHERE room_id = '3b476463-ea58-4d5b-abb4-ad460e844a8b'"""
if old not in room_source:
    raise SystemExit("Expected optional room-state insert was not found.")
room_migration.write_text(room_source.replace(old, new, 1))
