#!/usr/bin/env bash
# PRODUCTIZATION-4 Phase B — host pre-flight.
#
# Collects host facts and hands them to the product's decision logic
# (src/modules/runtime/local/preflight.ts) so the installer and the tests
# judge a machine by exactly the same rules.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
nova_load_env

platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
[[ "$platform" == mingw* || "$platform" == msys* || "$platform" == cygwin* ]] && platform="windows"
arch="$(uname -m)"

if [[ "$platform" == "linux" ]]; then
  memory_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0) / 1024 ))
else
  memory_mb=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1048576 ))
fi
disk_mb=$(df -Pm "$NOVA_LOCAL_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
: "${disk_mb:=0}"

pg_version="$(psql --version 2>/dev/null | awk '{print $3}')"
[[ -z "$pg_version" ]] && pg_version="$(postgres --version 2>/dev/null | awk '{print $3}')"

# Ports: a port held by our own pidfile process is an upgrade, not a conflict.
ports_json="[]"
collect_ports() {
  local entries=()
  for port in 5432 "$NOVA_POSTGREST_PORT" "$NOVA_GATEWAY_PORT" "$NOVA_GATEWAY_TLS_PORT"; do
    local owner
    owner="$(ss -lntp 2>/dev/null | awk -v p=":$port$" '$4 ~ p {print $NF}' | head -1)"
    [[ -z "$owner" ]] && continue
    local ours=false
    for pidfile in "$NOVA_RUN_DIR"/*.pid; do
      [[ -f "$pidfile" ]] || continue
      grep -q "pid=$(cat "$pidfile")," <<<"$owner" && ours=true
    done
    entries+=("{\"port\":$port,\"process\":\"$(sed 's/"/\\"/g' <<<"$owner" | cut -c1-60)\",\"ownedByNova\":$ours}")
  done
  local IFS=,
  ports_json="[${entries[*]}]"
}
collect_ports

FACTS=$(cat <<JSON
{"platform":"$platform","architecture":"$arch","memoryMb":$memory_mb,"diskFreeMb":$disk_mb,
 "postgresVersion":$( [[ -n "$pg_version" ]] && echo "\"$pg_version\"" || echo null ),"portsInUse":$ports_json}
JSON
)

export NOVA_PREFLIGHT_FACTS="$FACTS"
bun --silent -e "
  const { evaluatePreflight } = await import('$NOVA_ROOT/src/modules/runtime/local/preflight.ts');
  const report = evaluatePreflight(JSON.parse(process.env.NOVA_PREFLIGHT_FACTS));
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? 'PASS' : c.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(\`  [\${mark}] \${c.label.padEnd(30)} \${c.detail}\`);
  }
  console.log(report.ok ? '[nova-local] pre-flight OK' : \`[nova-local] pre-flight FAILED (\${report.blocking} blocking)\`);
  process.exit(report.ok ? 0 : 1);
"
