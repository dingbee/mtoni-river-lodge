# PRODUCTIZATION-4F — Local Installation Safety Audit (read-only)

Scope: prove that a first NOVA Hospitality appliance install on the developer's
Windows 11 machine (WSL2) is isolated from the source repository, the hosted
backend, Mtoni production, and the existing dev environment. No installation
was performed. No product or Restaurant/Bar business logic was modified.

## A. Installation path

| Artefact | Location | Shared with hosted? |
|---|---|---|
| PostgreSQL data | WSL2 cluster `/var/lib/postgresql/17/main`, database `nova_local` | No |
| NOVA configuration | `local/.env` (0600, generated at install) | No |
| Secrets (JWT/ES256) | `local/keys/` (0700, key 0600) | No |
| TLS keys/certs | `local/keys/tls/` (own CA per install) | No |
| Backups | `local/backups/` (0700) | No |
| Logs / PIDs | `local/run/` | No |
| Application bundle | `dist/` (`NOVA_APP_BUNDLE_DIR` overridable) | Shared directory with dev builds — see G |

All are git-ignored (`local/.env`, `local/keys/`, `local/run/`, `local/backups/`, `dist`).

## B. Database isolation

- `init-db.sh` creates `nova_local` only if absent (`CREATE DATABASE` guarded by `pg_database` lookup); it never drops.
- Connection path: `psql` via `PGHOST=127.0.0.1 PGPORT=5432 PGUSER=nova_superuser PGDATABASE=nova_local`; PostgREST uses `postgres://nova_authenticator:<generated>@127.0.0.1:5432/nova_local`. Loopback only.
- No Supabase host, service-role key, or hosted credential appears in any local script.
- `install.sh` classifies existing state; an unknown/foreign database aborts, an existing NOVA install requires `--upgrade`/`--repair`.
- No Mtoni tenant/property rows: schema comes from `supabase/migrations` (structure only) plus `local/sql/*`; first-run bootstrap creates the property.

## C. Environment isolation — one real risk found and fixed

Findings before the fix:
1. The repository root `.env` is git-tracked and holds hosted `SUPABASE_URL`/`VITE_SUPABASE_*`.
2. `build-ui.sh` exported sentinel values, but the tracked `.env` could still supply `VITE_SUPABASE_PROJECT_ID`/`SUPABASE_*` into the bundle.
3. `install.sh` accepted **any** pre-existing `dist/` — on this machine that is the hosted Mtoni build, which would have been served by the appliance and pointed at the hosted backend.
4. The gateway was launched from the repo root, where Bun auto-loads `.env`, so it could inherit hosted variables.

Installer-only fixes applied (no product logic touched):
- `build-ui.sh` now shadows the repo `.env` with a temporary, auto-restored `.env.local`, forces local/sentinel Supabase values, and writes a `dist/.nova-local-build` provenance marker.
- New `local/scripts/verify-bundle.sh`: fails if the bundle lacks the local marker or contains any `https://*.supabase.co|in` origin. Wired into `install.sh` and `start.sh`, plus `novactl.sh verify-ui`.
- `install.sh` treats an unmarked bundle as "no bundle" and rebuilds it.
- `start.sh` launches the gateway with `bun --env-file=/dev/null` and `env -u` for `SUPABASE_*`, `VITE_SUPABASE_*`, `DATABASE_URL`, `LOVABLE_API_KEY`.

Inheritance of production credentials is now structurally blocked.

## D. Ports

| Component | Port | Exposure |
|---|---|---|
| PostgreSQL | 5432 | loopback |
| PostgREST | 3001 | loopback (`NOVA_POSTGREST_HOST=127.0.0.1`) |
| Gateway HTTP | 8000 | LAN |
| Gateway HTTPS | 8443 | LAN |

Pre-flight fails (does not take over) on any occupied port not owned by a NOVA
pidfile. Port 8443 was missing from the check and has been added
(`preflight.sh` + `HOST_REQUIREMENTS.requiredPorts`). Note 5432 is the common
dev Postgres port: if the Windows host already runs Postgres on 5432, WSL2 in
mirrored networking may report a conflict — set `NOVA_DB_PORT` to e.g. 5434.

## E. TLS

`gen-tls.sh` creates a per-installation CA (`nova-local-ca.*`) and leaf
(`gateway.*`) under `local/keys/tls/`, refusing to re-issue without `--force`.
No Mtoni, Nolmark, or development certificate is referenced anywhere. SANs come
from `NOVA_TLS_HOSTNAMES`/`NOVA_TLS_IPS` (falling back to `hostname`/`hostname -I`),
which is how the Windows LAN IP gets into the certificate.

## F. Data safety

- `install.sh` never drops/recreates; aborts on foreign data.
- `--upgrade`/`--repair` are explicit flags; `--dry-run` changes nothing.
- `restore.sh` verifies the manifest checksum, validates the target name, and requires typing the database name (or `--yes`); non-interactive without `--yes` refuses.
- `uninstall.sh` by default stops services and removes only PID/conf files; `--purge-data` requires typing the database name and never deletes backups.
- All destructive statements are scoped to `$PGDATABASE`/`$TARGET`; no dev or hosted database can be reached (loopback + local role only).

## G. Repository safety

The installer does write inside the repository tree: `local/.env`, `local/keys/`,
`local/run/`, `local/backups/`, `dist/`, `local/install.json`. Everything except
`local/install.json` is git-ignored; no secret becomes tracked. Recommended for
this machine: set `NOVA_BACKUP_DIR=$HOME/nova/backups`, `NOVA_KEY_DIR=$HOME/nova/keys`,
`NOVA_RUN_DIR=$HOME/nova/run` and `NOVA_APP_BUNDLE_DIR=$HOME/nova/dist` so runtime
state and the appliance bundle live outside the source tree and never collide
with hosted dev builds.

## H. Mtoni isolation

`local/` scripts, SQL, and gateway: 0 Mtoni domains, tenant IDs, property IDs,
credentials, or operational records. The appliance database starts empty.

Residual (amber): the application source is shared, so a bundle built from this
repo still contains the Mtoni-branded marketing routes and text. The gateway
redirects `/` to `/admin`, and `verify-bundle.sh` guarantees no hosted backend
origin, but visual de-branding of the public site remains a Productization-5
item. For this test install that is cosmetic only.

## I. Hosted environment safety

Gateway startup makes no outbound call: the only `fetch` targets are
`127.0.0.1` PostgREST (proxy + health). No Supabase, Lovable, Mtoni, or external
API call occurs at start. Optional AI features are hosted-only and unreachable
without credentials, which the appliance no longer inherits. Core Restaurant/Bar
trading is fully local.

## J. Rollback (do not run during the audit)

```bash
bash local/scripts/stop.sh                     # stop gateway + PostgREST
bash local/scripts/uninstall.sh                # runtime cleanup only; DB, keys, backups intact
bash local/scripts/uninstall.sh --purge-data   # additionally DROP nova_local (types confirmation)
rm -rf local/keys local/run local/.env local/install.json   # TLS + secret cleanup
rm -rf local/backups                           # backup cleanup (last resort)
rm -rf dist                                    # remove appliance bundle
```
Nothing above touches the WSL Postgres cluster itself, other databases, the
repository source, or the Lovable dev workflow.

## K. Verdict — 🟡 SAFE WITH SPECIFIC PRECAUTIONS

Safe after the four installer fixes in section C. Precautions: keep runtime
state outside the repo, avoid a 5432 clash, and expect Mtoni marketing branding
inside the bundle.

### Installation sequence for this computer

```powershell
# Windows (PowerShell, admin) — LAN IP + firewall
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.PrefixOrigin -ne 'WellKnown'}
New-NetFirewallRule -DisplayName "NOVA 8443" -Direction Inbound -LocalPort 8443 -Protocol TCP -Action Allow
```

```bash
# WSL2 Ubuntu
sudo service postgresql start
cd /path/to/repo
export NOVA_KEY_DIR=$HOME/nova/keys NOVA_RUN_DIR=$HOME/nova/run \
       NOVA_BACKUP_DIR=$HOME/nova/backups NOVA_APP_BUNDLE_DIR=$HOME/nova/dist
export NOVA_TLS_IPS="127.0.0.1 <WINDOWS-LAN-IP>" NOVA_TLS_HOSTNAMES="nova"
bash local/scripts/install.sh --dry-run     # pre-flight + state decision only
bash local/scripts/build-ui.sh              # appliance bundle (verified automatically)
bash local/scripts/install.sh               # full install
bash local/scripts/novactl.sh ready
```

First-run URL: `https://<WINDOWS-LAN-IP>:8443/`. Tablets: install
`$NOVA_KEY_DIR/tls/nova-local-ca.crt` as a trusted CA, open the same URL, add to
home screen. Physical Android/PWA certification (4E) is still outstanding.
