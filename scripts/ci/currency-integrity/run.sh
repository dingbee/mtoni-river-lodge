#!/usr/bin/env bash
# Local, throwaway reproduction of the StayNas currency-integrity incident.
# Replays every repository migration into a scratch PostgreSQL database with
# Supabase platform stubs, then runs the incident fixture and Test A.
# Never point this at a shared or production database: it drops $DB.
#   PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=... DB=staynas_currency_check scripts/ci/currency-integrity/run.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
DB=${DB:-staynas_currency_check}
case "$DB" in postgres|template0|template1) echo "refusing to use $DB"; exit 2;; esac
WORK=$(mktemp -d)
dropdb --if-exists "$DB" && createdb "$DB" || exit 1
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase-stub-preamble.sql" >/dev/null || exit 1
fail=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  sed -E 's/CREATE EXTENSION (IF NOT EXISTS )?(pg_net|pgmq|supabase_vault|pg_cron)[^;]*;/-- stubbed extension/I' "$f" > "$WORK/cur.sql"
  # One historical migration opens BEGIN without COMMIT; close it so its objects persist.
  if grep -qi "^BEGIN;" "$WORK/cur.sql" && ! grep -qiE "^\s*COMMIT;" "$WORK/cur.sql"; then echo "COMMIT;" >> "$WORK/cur.sql"; fi
  if ! out=$(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "SET search_path=public,extensions" -f "$WORK/cur.sql" 2>&1); then
    echo "FAIL $(basename "$f"): $(echo "$out" | grep -m1 ERROR)"; fail=$((fail+1))
  fi
done
echo "migration replay failures: $fail"
psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/incident-fixture.sql" -f "$HERE/incident-usd-plan.sql" >/dev/null || exit 1
psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/test-a-nolmark-tzs.sql"
