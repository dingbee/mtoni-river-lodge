#!/usr/bin/env bash
# PRODUCTIZATION-4D — build the application bundle for the local appliance.
#
# Same source, same transactional engines, same Nitro fetch-handler artefact as
# the hosted deployment. The ONLY difference is configuration: the client is
# built against a sentinel origin which `stamp-ui.sh` rewrites to the real
# appliance origin at install time, so no customer address is ever baked in.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

export VITE_NOVA_RUNTIME_MODE=local
export NOVA_RUNTIME_MODE=local
export VITE_SUPABASE_URL="${NOVA_ORIGIN_SENTINEL:-https://nova-appliance.invalid}"
export VITE_SUPABASE_PUBLISHABLE_KEY="${NOVA_LOCAL_ANON_KEY:-nova-local-anon}"

nova_log "Building NOVA Hospitality UI for the local appliance"
( cd "$NOVA_ROOT" && bun run build )
nova_log "UI bundle written to $NOVA_ROOT/dist"
