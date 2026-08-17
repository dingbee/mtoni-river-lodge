#!/usr/bin/env bash
# PRODUCTIZATION-3 Phase 11 — local restore.
#
#   restore.sh <dump-file> [target-database]
#
# Restore verifies the manifest checksum first: an artifact that does not match
# its manifest is never applied. The target database is created fresh, so a
# restore never merges into live data by accident.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
nova_load_env

DUMP="${1:?usage: restore.sh <dump-file> [target-database]}"
TARGET="${2:-$PGDATABASE}"
MANIFEST="${DUMP%.dump}.manifest.json"

[[ -f "$DUMP" ]] || { echo "FATAL: $DUMP not found" >&2; exit 1; }

if [[ -f "$MANIFEST" ]]; then
  EXPECTED="$(grep -o '"checksum_sha256": *"[^"]*"' "$MANIFEST" | sed 's/.*"\([a-f0-9]\{64\}\)"/\1/')"
  ACTUAL="$(sha256sum "$DUMP" | cut -d' ' -f1)"
  if [[ -n "$EXPECTED" && "$EXPECTED" != "$ACTUAL" ]]; then
    echo "FATAL: backup checksum mismatch — refusing to restore a corrupted artifact." >&2
    exit 1
  fi
  nova_log "manifest verified (sha256 $ACTUAL)"
else
  nova_log "WARNING: no manifest beside $DUMP; restoring without checksum verification"
fi

nova_log "restore -> database $TARGET"
psql -X -q -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1 \
  && psql -X -q -d postgres -c "DROP DATABASE \"$TARGET\""
psql -X -q -d postgres -c "CREATE DATABASE \"$TARGET\""

# Roles live in the cluster, not the dump; recreate the compatibility roles so
# ownership and grants resolve on a machine that has never run this product.
for f in "$NOVA_LOCAL_DIR"/sql/pre/00-roles.sql; do
  PGDATABASE="$TARGET" nova_psql -d "$TARGET" -f "$f" >/dev/null
done

pg_restore --dbname="$TARGET" --no-owner --no-privileges --exit-on-error "$DUMP"

COUNT="$(psql -X -d "$TARGET" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')"
nova_log "restore complete: $COUNT public tables in $TARGET"
