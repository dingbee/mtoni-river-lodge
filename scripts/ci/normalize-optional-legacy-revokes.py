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

# The following historical migration contains demonstration bookings for a
# property-specific room UUID. A later StayNas migration intentionally
# truncates the legacy property catalog, so clean CI has no such room. Keep
# the fixture migration intact for databases that still have the legacy room,
# but skip only this optional demo-data block in a clean property-neutral DB.
fixture_migration = Path(
    "supabase/migrations/20260806142337_0c977466-741b-4cd6-bc22-892f03edb5bd.sql"
)
fixture_source = fixture_migration.read_text()
fixture_start = """  c1 uuid; c2 uuid; c4 uuid;
BEGIN
  INSERT INTO public.bookings"""
fixture_guarded_start = """  c1 uuid; c2 uuid; c4 uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rooms
     WHERE id = '3b476463-ea58-4d5b-abb4-ad460e844a8b'
  ) THEN
  INSERT INTO public.bookings"""
if fixture_start not in fixture_source:
    raise SystemExit("Expected legacy booking fixture block was not found.")
fixture_source = fixture_source.replace(fixture_start, fixture_guarded_start, 1)
fixture_end = """   WHERE id = unit1;
END $$;"""
fixture_guarded_end = """   WHERE id = unit1;
  END IF;
END $$;"""
if fixture_end not in fixture_source:
    raise SystemExit("Expected legacy booking fixture terminator was not found.")
fixture_source = fixture_source.replace(fixture_end, fixture_guarded_end, 1)
fixture_migration.write_text(fixture_source)

# In the clean-reset schema these legacy global slug indexes are backed by
# UNIQUE constraints. PostgreSQL will not drop an index owned by a constraint.
# Retain the stronger global uniqueness in this ephemeral CI database while
# still creating the property-scoped indexes; live UAT has the standalone
# indexes and runs the unmodified migration.
property_migration = Path(
    "supabase/migrations/20260926150000_staynas_property_room_hardening.sql"
)
property_source = property_migration.read_text()
for index in ("rooms_slug_key", "room_categories_slug_key", "extras_slug_key"):
    statement = f"DROP INDEX IF EXISTS {index};"
    if statement not in property_source:
        raise SystemExit(f"Expected legacy global slug index drop was not found: {index}")
    property_source = property_source.replace(
        statement,
        f"-- CI retains the constraint-backed {index} in the clean-reset schema.",
        1,
    )
property_migration.write_text(property_source)
