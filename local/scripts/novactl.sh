#!/usr/bin/env bash
# PRODUCTIZATION-4 Phase E — service lifecycle control.
#
#   start | stop | restart | status | health | ready | version
#
# "status" answers "are the processes running"; "ready" answers "can the
# business trade" — the two are deliberately different questions.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
nova_load_env

gw="http://127.0.0.1:$NOVA_GATEWAY_PORT"

pid_alive() { [[ -f "$NOVA_RUN_DIR/$1.pid" ]] && kill -0 "$(cat "$NOVA_RUN_DIR/$1.pid")" 2>/dev/null; }

cmd_status() {
  pg_isready -h "$NOVA_DB_HOST" -p "$NOVA_DB_PORT" >/dev/null 2>&1 \
    && echo "  database    RUNNING" || echo "  database    STOPPED"
  pid_alive postgrest && echo "  data-service RUNNING" || echo "  data-service STOPPED"
  pid_alive gateway   && echo "  gateway      RUNNING" || echo "  gateway      STOPPED"
}

cmd_ready() {
  local code
  code=$(curl -s -o "$NOVA_RUN_DIR/ready.json" -w '%{http_code}' "$gw/ready" || echo 000)
  cat "$NOVA_RUN_DIR/ready.json" 2>/dev/null; echo
  if [[ "$code" == "200" ]]; then nova_log "SYSTEM READY"; return 0; fi
  echo "SYSTEM NOT READY (HTTP $code)" >&2; return 1
}

case "${1:-status}" in
  start)   bash "$NOVA_LOCAL_DIR/scripts/start.sh" ;;
  stop)    bash "$NOVA_LOCAL_DIR/scripts/stop.sh" ;;      # reverse dependency order
  restart) bash "$NOVA_LOCAL_DIR/scripts/stop.sh"; bash "$NOVA_LOCAL_DIR/scripts/start.sh" ;;
  status)  cmd_status ;;
  health)  curl -s "$gw/health"; echo ;;
  ready)   cmd_ready ;;
  version) curl -s "$gw/nova/v1/system"; echo ;;
  *) echo "usage: novactl.sh {start|stop|restart|status|health|ready|version}" >&2; exit 2 ;;
esac
