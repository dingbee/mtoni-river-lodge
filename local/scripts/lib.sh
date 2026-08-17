#!/usr/bin/env bash
# NOVA Hospitality — Restaurant & Bar OS — local runtime shared shell helpers.
set -euo pipefail

NOVA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NOVA_LOCAL_DIR="$NOVA_ROOT/local"

nova_load_env() {
  local env_file="${NOVA_ENV_FILE:-$NOVA_LOCAL_DIR/.env}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
  : "${NOVA_DB_HOST:=127.0.0.1}"
  : "${NOVA_DB_PORT:=5432}"
  : "${NOVA_DB_NAME:=nova_local}"
  : "${NOVA_DB_SUPERUSER:=nova_superuser}"
  : "${NOVA_DB_AUTHENTICATOR:=nova_authenticator}"
  : "${NOVA_POSTGREST_PORT:=3001}"
  : "${NOVA_POSTGREST_HOST:=127.0.0.1}"
  : "${NOVA_POSTGREST_SCHEMAS:=public,storage}"
  : "${NOVA_GATEWAY_HOST:=0.0.0.0}"
  : "${NOVA_GATEWAY_PORT:=8000}"
  : "${NOVA_BACKUP_DIR:=$NOVA_LOCAL_DIR/backups}"
  : "${NOVA_RUN_DIR:=$NOVA_LOCAL_DIR/run}"
  export PGHOST="$NOVA_DB_HOST" PGPORT="$NOVA_DB_PORT" PGUSER="$NOVA_DB_SUPERUSER" PGDATABASE="$NOVA_DB_NAME"
  export PGSSLMODE="${PGSSLMODE:-prefer}"
  [[ -n "${NOVA_DB_SUPERUSER_PASSWORD:-}" ]] && export PGPASSWORD="$NOVA_DB_SUPERUSER_PASSWORD"
  mkdir -p "$NOVA_RUN_DIR"
}

nova_require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "FATAL: required configuration '$name' is not set (see local/.env.example)" >&2
    exit 1
  fi
}

nova_psql() {
  psql -v ON_ERROR_STOP=1 -X -q "$@"
}

nova_log() { printf '[nova-local] %s\n' "$*"; }