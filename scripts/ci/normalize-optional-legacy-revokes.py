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
    r"^(REVOKE (?:ALL|EXECUTE) ON FUNCTION) (public\.[^(]+\([^)]*\)) FROM ([^;]+);$",
    re.MULTILINE,
)

def conditional_revoke(match: re.Match[str]) -> str:
    privilege, signature, roles = match.groups()
    statement = f"{privilege} {signature} FROM {roles}"
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
if old in room_source:
    room_migration.write_text(room_source.replace(old, new, 1))
elif "standard-river-" not in room_source or "_standard_room_id" not in room_source:
    raise SystemExit("Room-state migration is neither legacy nor the expected portable slug-based fixture.")
# The committed migration already resolves generated room IDs by stable slugs,
# so no ephemeral room-state rewrite is needed.

# The historical booking fixture now resolves the seeded room and unit by stable
# slugs/labels, so it is intentionally applied in clean CI rather than skipped.


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

# A legacy concierge migration expects a hostname registry that is provisioned
# in live environments but is not part of the clean migration chain. Execute
# its backfill only when the registry exists; the migration's following
# NOT-NULL/unmapped-row check still fails closed if orphan sessions exist.
concierge_migration = Path(
    "supabase/migrations/20261031190000_sn_iq_04_active_property_authorization_helpers.sql"
)
concierge_source = concierge_migration.read_text()
old_backfill = """ UPDATE public.ai_concierge_sessions s
 SET property_id=d.property_id
 FROM public.staynas_property_domains d
 WHERE s.property_id IS NULL
   AND lower(regexp_replace(split_part(split_part(s.referer,'/',3),':',1),'^www\\\\.',''))=lower(d.hostname);"""
new_backfill = """ IF to_regclass('public.staynas_property_domains') IS NOT NULL THEN
  EXECUTE $ci$
   UPDATE public.ai_concierge_sessions s
   SET property_id=d.property_id
   FROM public.staynas_property_domains d
   WHERE s.property_id IS NULL
     AND lower(regexp_replace(split_part(split_part(s.referer,'/',3),':',1),'^www\\\\.',''))=lower(d.hostname)
  $ci$;
 END IF;"""
if old_backfill not in concierge_source:
    raise SystemExit("Expected optional concierge hostname backfill was not found.")
concierge_migration.write_text(concierge_source.replace(old_backfill, new_backfill, 1))

# Migration IDs are already unique in the committed repository. Do not rename
# unrelated revenue-ledger and AI-policy migrations in the ephemeral checkout.

# The clean migration chain does not define the two legacy RPC overloads
# targeted by this compatibility migration. Preserve the compatibility fix
# for environments where either overload exists, but skip absent overloads.
jwt_compat_migration = Path(
    "supabase/migrations/20261105103000_fix_property_rpc_jwt_role_claim_resolution.sql"
)
jwt_compat_source = jwt_compat_migration.read_text()
declaration = "  v_signature regprocedure;"
if declaration not in jwt_compat_source:
    raise SystemExit("Expected legacy JWT compatibility declaration was not found.")
jwt_compat_source = jwt_compat_source.replace(
    declaration,
    declaration + "\n  v_signature_text text;",
    1,
)
old_loop = """  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_room_availability(date,date,uuid)'::regprocedure,
    'public.create_booking(text,date,date,integer,integer,text,text,text,jsonb,integer,integer,uuid,text,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_get_functiondef(v_signature);
    IF position(v_old in v_definition) = 0 THEN
      RAISE EXCEPTION 'Expected legacy JWT role check not found in %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
    EXECUTE v_definition;
  END LOOP;"""
new_loop = """  FOREACH v_signature_text IN ARRAY ARRAY[
    'public.get_room_availability(date,date,uuid)',
    'public.create_booking(text,date,date,integer,integer,text,text,text,jsonb,integer,integer,uuid,text,uuid)'
  ]
  LOOP
    v_signature := to_regprocedure(v_signature_text);
    IF v_signature IS NOT NULL THEN
      v_definition := pg_get_functiondef(v_signature);
      IF position(v_old in v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected legacy JWT role check not found in %', v_signature;
      END IF;
      v_definition := replace(v_definition, v_old, v_new);
      EXECUTE v_definition;
    END IF;
  END LOOP;"""
if old_loop not in jwt_compat_source:
    raise SystemExit("Expected legacy JWT compatibility function loop was not found.")
jwt_compat_migration.write_text(jwt_compat_source.replace(old_loop, new_loop, 1))

# The current CC-01 authorization migration revokes direct access from legacy
# trigger functions that are present in deployed schemas but not all clean CI
# baselines. Keep the migration unchanged for deployed environments; normalize
# only the ephemeral checkout so absent optional trigger functions are skipped.
cc01_migration = Path(
    "supabase/migrations/20261106180545_cc01_authorization_identity_scope.sql"
)
cc01_source = cc01_migration.read_text()
if "to_regprocedure(v_signature)" in cc01_source:
    # The committed migration already guards optional trigger-function revokes.
    pass
else:
    cc01_patched, cc01_count = pattern.subn(conditional_revoke, cc01_source)
    if cc01_count < 1:
        raise SystemExit("No CC-01 trigger-function revokes found; inspect migration drift.")
    cc01_migration.write_text(cc01_patched)
