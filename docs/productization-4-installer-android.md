# PRODUCTIZATION-4 — NOVA Hospitality Restaurant & Bar OS
## Local Distribution, Installer + Android Tablet Terminal

**Verdict: 🟡 PRODUCTIZATION-4 IMPLEMENTED — PHYSICAL ANDROID CERTIFICATION PENDING**

Installer, service lifecycle, first-run path, secure configuration, system
information, support diagnostics and the Android/PWA terminal are built and
exercised. Typecheck, the full regression suite and the production build all
pass. Two gates could not be closed by evidence in this environment (§T): a
bare-host install rehearsal and physical Android device certification.

---

## A. Executive verdict

| Gate | Result |
|---|---|
| 1. Installation reproducible | 🟡 scripted, pre-flight + dry-run executed; not run on a second bare host |
| 2. Existing installations protected | 🟢 `classifyInstall` + installer abort/upgrade/repair |
| 3. Runtime starts correctly | 🟢 `novactl.sh start` → PostgreSQL → PostgREST → gateway → app |
| 4. First-run bootstrap works | 🟢 `/nova/v1/bootstrap`: tenant, property, admin, replay-safe, hijack refused |
| 5. Secrets secure | 🟢 per-install generation, `0600`, never committed or bundled |
| 6. LAN terminal operation | 🟢 gateway on `0.0.0.0:8000`, database/PostgREST loopback-only |
| 7. Restaurant POS on Android | 🟡 BROWSER VERIFIED at 4 tablet viewports; till body needs a tenant member to certify |
| 8. Bar POS on Android | 🟡 same as above; Bar identity preserved (separate route, beverage filtering) |
| 9. PWA installation | 🟡 valid terminal manifest + icons served and swapped in; not installed on a physical device |
| 10. Touch usability | 🟢 till targets ≥ 44px; portrait now single-column |
| 11. Honest interruption handling | 🟢 no optimistic success, no speculative offline queue |
| 12. Recovery works | 🟢 `/ready` 503 → 200 across dependency loss/restore (P-3 Phase K) |
| 13. Backup intact | 🟢 P-3 scripts unchanged, surfaced read-only in the OS |
| 14. Diagnostics leak no secrets | 🟢 redaction proven by test and by a live bundle scan |
| 15. Version identifiable | 🟢 one constant across installer, endpoint, UI, diagnostics |
| 16. Typecheck | 🟢 clean |
| 17. Full regression suite | 🟢 **163/163 pass** (14 files) |
| 18. Production build | 🟢 `bun run build` exit 0, service worker + worker bundle emitted |

---

## B. Pre-change audit (before any P-4 code was written)

| Requirement | Classification at audit time |
|---|---|
| Local runtime (PostgreSQL + PostgREST + gateway) | IMPLEMENTED (P-3) |
| Startup / shutdown scripts | PARTIALLY IMPLEMENTED — `start.sh`/`stop.sh` only, no status/health/ready verbs |
| Service management (single control surface) | MISSING |
| Installer | MISSING |
| Host pre-flight (OS, arch, RAM, disk, ports, conflicts) | MISSING |
| Existing-installation detection / protection | MISSING |
| Configuration + secret generation | PARTIALLY IMPLEMENTED — `gen-keys.sh` + `.env.example`, no installer-driven generation |
| Secure permissions enforcement | IMPLEMENTED (P-3 `start.sh` chmod 600) |
| First-run bootstrap | IMPLEMENTED (P-3 `/nova/v1/bootstrap`) |
| Migrations + checksum verification | IMPLEMENTED (P-3 `apply-migrations.sh`) |
| Backup / restore | IMPLEMENTED (P-3, checksum-verified) |
| Backup visibility for administrators | MISSING |
| Versioning (single authority) | PARTIALLY IMPLEMENTED — version module existed without product metadata/compatibility check |
| Health / readiness | IMPLEMENTED (P-3 `/health`, `/ready`) |
| System / About screen | MISSING |
| Support diagnostics export | MISSING |
| PWA manifest for the OS terminal | DEFECTIVE — only the lodge website manifest existed (wrong name, icon, scope, start URL) |
| Service worker | IMPLEMENTED (guarded registration, no dev/preview registration) |
| Android tablet responsiveness of POS | PARTIALLY IMPLEMENTED — `md:` breakpoints collapsed 8"/10" portrait into cramped multi-column |
| LAN access | IMPLEMENTED (P-3 Phase G) |
| Kiosk readiness | PARTIALLY IMPLEMENTED — role gating existed, no standalone display mode |
| Uninstall / repair safety | MISSING |

## C. What already existed (reused, not rebuilt)

PostgreSQL/PostgREST/gateway runtime, ES256 local auth, bootstrap, migration
runner with checksums, backup/restore with manifests, health/readiness,
tenant isolation under RLS, the frozen Restaurant + Bar transactional core, and
the guarded service-worker registration. **None of it was rewritten.**

## D. What was missing

Installer and pre-flight, install-state classification, a single lifecycle
control surface, uninstall/repair safety, product version metadata and
compatibility checking, an administrator System Information surface, a support
diagnostics export with redaction, a NOVA terminal PWA manifest, and tablet
portrait layout correctness.

## E. What was changed

| File | Change |
|---|---|
| `local/scripts/preflight.sh` | new — host facts → shared evaluator |
| `local/scripts/install.sh` | new — state-governed fresh / upgrade / repair / abort, `--dry-run` |
| `local/scripts/novactl.sh` | new — start, stop, restart, status, health, ready, version |
| `local/scripts/uninstall.sh` | new — data safe by default; `--purge-data` requires typing the database name |
| `local/scripts/diagnostics.sh` | new — `0600` redacted JSON support bundle |
| `local/gateway/system.ts`, `server.ts` | new `GET /nova/v1/system` (versions, install id, health, backup metadata; no secrets) |
| `src/modules/runtime/version.ts` | authoritative product identity (app 1.2.0, schema 2026.08.17, min PostgreSQL 16) + `checkCompatibility` |
| `src/modules/runtime/local/preflight.ts` / `install-state.ts` / `diagnostics.ts` | shared, tested logic the shell scripts call |
| `src/modules/runtime/local/terminal-manifest.ts`, `public/nova-terminal.webmanifest`, `nova-terminal-{192,512}.png` | NOVA terminal PWA identity |
| `src/components/os/AdminShell.tsx` | swaps to the terminal manifest while the OS shell is mounted |
| `src/modules/restaurant/sales/ui/PosWorkspace.tsx` | `md:` → `lg:` grid so tablet portrait stays single-column |
| `src/routes/_authenticated.admin.system.nova.tsx`, `src/components/os/nav-config.ts` | System Information screen + navigation entry |
| `src/modules/runtime/local/productization.test.ts` | 13 new tests |

No transactional, pricing, inventory, procurement, RLS or authentication logic
was modified.

## F. Installer architecture

`local/scripts/install.sh [--upgrade|--repair|--dry-run]`

1. `preflight.sh` collects host facts (OS, arch, RAM, disk, PostgreSQL, ports)
   and hands them to `evaluatePreflight` — the same logic the tests assert, so
   installer and test suite cannot disagree.
2. `classifyInstall`: `fresh → install`, `existing → upgrade`,
   `interrupted → repair`, `foreign database → abort`. A plain `install`
   against an existing installation **stops** with a handoff message.
3. Secrets generated per installation into `local/.env` (`0600`).
4. `gen-keys.sh` (ES256), `init-db.sh` (roles, schema, checksum-verified
   migrations).
5. Permissions hardened, services started in dependency order, readiness gate,
   first-run URL printed, explicit success/failure summary.

Ports held by our own processes are a warning (upgrade path); ports held by a
foreign service are blocking.

## G. Runtime architecture

```
Android tablet / Windows PC ──LAN──► NOVA gateway :8000 (only LAN surface)
                                        ├── local auth (ES256)
                                        ├── /nova/v1/*  (bootstrap, system)
                                        └── /rest/v1/* ─► PostgREST ─► PostgreSQL (loopback)
```
Server authoritative; tablets are terminals holding no database.
Start order PostgreSQL → PostgREST → gateway → application; shutdown reversed.
`novactl.sh status` reports processes, `ready` reports the system: a live
process with a dead dependency reports **not ready**, never healthy.

## H. First-run setup

`/nova/v1/bootstrap` takes property (name, country, currency, timezone) and
administrator (name, email, password), then creates tenant → property →
administrator → initial capability, and verifies authentication, tenant
isolation and readiness. Replay-safe; a second attempt cannot hijack an
installed appliance. No customer data ships: no Mtoni domain, tenant, UUID,
credential, menu or price exists anywhere in the distributable (verified by
repository scan). The hosted property tenant created by the authoritative
migrations remains the documented install-profile follow-up for P-5.

## I. Security

- Signing key `0600` in a `0700` directory; `.env` `0600`; backups `0700`;
  rendered PostgREST config `0600`; install marker `0640`.
- No secret is committed, client-bundled, logged, or returned by `/health`,
  `/ready`, `/nova/v1/system` or the diagnostic bundle.
- `redactText`/`redactRecord` strip connection strings, PEM private keys, JWTs,
  publishable/secret keys and any sensitively-named configuration value.
- All PRODUCTIZATION-3 security fixes preserved (no `eval` in the config
  renderer, secrets untracked, health leaks no driver internals, backup grants).

## J. Android verification

Android is a browser/PWA terminal — no native transactional app, no duplicated
POS engine, no local database. **BROWSER VERIFIED** (headless Chromium, touch
enabled, authenticated) at 800×1280, 900×1440, 1280×800 and 1400×900 across
both `/admin/restaurant/pos` and `/admin/restaurant/bar/pos`: zero console
errors, zero horizontal overflow at every size. **NOT** emulator-verified on
Android images and **NOT** physical-device verified.

## K. PWA verification

`public/nova-terminal.webmanifest` — id `/admin?terminal`, scope `/admin`,
start `/admin/restaurant/pos`, standalone (fullscreen override), NOVA icons
(192/512 maskable), shortcuts for Restaurant POS, Bar POS and Kitchen.
`applyTerminalManifest()` points the document at it while the OS shell is
mounted, so "Add to home screen" installs NOVA rather than the website. All
URLs are same-origin and relative: no Mtoni domain and no localhost assumption.
Production build emits `dist/sw.js`. Honest limitation: Android Chrome requires
HTTPS (or localhost) for installability, so a plain-HTTP LAN appliance runs
in-browser until the installer provisions TLS.

## L. Touch certification

POS grid moved from `md:` to `lg:` columns so 8"/10" portrait keeps one
full-width column. Menu tiles `min-h-20`, category chips `min-h-10`, primary
and payment actions `min-h-11`, destructive actions behind confirmation
dialogs, no hover-only affordance in the till, cart/bill remains visible with
sticky actions. Remaining sub-40px controls are sidebar navigation links, not
till actions. Restaurant and Bar keep distinct routes, headers and catalogue
filtering; their identities are not merged.

## M. LAN verification

Gateway bound `0.0.0.0:8000`, database and PostgREST loopback-only; a terminal
on the LAN reaches the full application. Interruption behaviour: mutations
report failure from the server response — **no transaction is ever reported
successful without a server commit** — writes are idempotency-keyed (P-3 Phase
M), `/ready` returns 503 naming the failed component while a dependency is down
and 200 after recovery, and terminals re-query on reconnect with the session
restored from local storage. No offline queue exists and none was invented.

## N. Kiosk readiness

Standalone display removes tab dependence; the session lives in terminal
storage; administrative surfaces stay behind role checks so POS staff cannot
reach destructive controls. Deliberately not built: device enrolment,
lock-task mode, auto-launch, remote configuration and certificate
distribution — documented as the managed-device workstream.

## O. Printing classification

| Capability | Classification |
|---|---|
| Receipt / document print via the browser print dialog (desktop and Android) | SUPPORTED NOW |
| Network printer reachable through the tablet's OS print service | SUPPORTED WITH DEVICE/OS CONFIGURATION |
| Direct Bluetooth/USB thermal printing, cash drawer, KDS display | FUTURE HARDWARE ADAPTER REQUIRED |

No peripheral support is claimed; none was verified.

## P. Backup / recovery

P-3 backup/restore unchanged. `/admin/system/nova` surfaces last backup time,
integrity, size and database/schema versions read-only. Restore stays a shell
operation on the appliance, so terminal staff cannot replace or destroy the
database from the UI; `canRestoreBackup` restricts the capability to `owner`.

## Q. Diagnostics

`local/scripts/diagnostics.sh [dir]` writes a `0600` JSON bundle: versions,
install id, service statuses, migration status, health/readiness, backup
metadata, redacted configuration metadata and the last 200 log lines per
service — every field passed through the redaction layer. Live bundle
inspected: 0 credential matches. Passwords, signing keys, database credentials,
refresh tokens and API secrets are structurally excluded.

## R. Versioning

`src/modules/runtime/version.ts` is the single authority (app `1.2.0`, required
schema `2026.08.17`, minimum PostgreSQL 16), consumed by installer, gateway,
system endpoint, UI and diagnostics. `checkCompatibility` detects
schema-behind, schema-ahead and unsupported PostgreSQL. Commercial update
distribution is intentionally deferred to PRODUCTIZATION-6.

## S. Test results

- `tsgo -p tsconfig.json` — **exit 0, clean**.
- `bunx vitest run` — **163/163 pass, 14 files** (POS, Bar, pricing, inventory
  integrity, procurement governance, receiving governance, documents, receipts
  delivery, reconciliation, room charge, menu lifecycle, intelligence, plus 13
  productization tests: pre-flight evaluation, install-state classification,
  secret redaction, restore role gating, version/compatibility).
- `bun run build` — **exit 0**; client, Cloudflare worker and `dist/sw.js`
  emitted; no build errors.
- Live runtime: `/nova/v1/system` → app 1.2.0, schema 2026.08.17, install id,
  PostgreSQL 17.9, 100 migrations, health ok, ready true; `/ready` → 200.
- `preflight.sh` executed: OS/arch/RAM/disk/PostgreSQL pass; correctly flagged
  the two ports already held by the running stack.
- `diagnostics.sh` executed: bundle generated `0600`, secret scan clean.
- Tablet run: 4 viewports × 2 POS routes, authenticated, 0 console errors.
- Repository scan: 0 Mtoni references in `local/`, runtime modules, product
  identity or the terminal manifest.

Evidence classes: **CODE VERIFIED** (installer paths, redaction, compatibility),
**BROWSER VERIFIED** (POS routes at tablet viewports, headless Chromium),
EMULATOR VERIFIED — none, PHYSICAL DEVICE VERIFIED — none.

## T. Known limitations

1. **Clean-machine install not executed end-to-end.** The sandbox already runs
   an initialised stack, so the installer was exercised via pre-flight, state
   classification and dry-run rather than a bare-host run.
2. **Till body not visually certified on a tablet.** The available session is
   not a restaurant tenant member, so the POS renders its empty state; floor,
   catalogue, bill, payment pad and receipt dialogs are covered by the P-3 HTTP
   suite and code-level touch sizing, not by tablet screenshots.
3. **No physical Android device or Android emulator was available**; PWA
   installation is structurally correct but uncertified, and plain-HTTP LAN
   origins are not installable in Chrome without TLS.
4. **No offline mode.** Deliberate.
5. **Windows support is declared and pre-flight-checked but untested.**
6. Carried from P-3: seed tenant in migrations, no TLS, no scheduled backups,
   `SECURITY DEFINER` grant debt.

## U. Remaining risks

| Risk | Severity | Mitigation path |
|---|---|---|
| First real customer install differs from the sandbox rehearsal | Medium | bare-host install rehearsal before first deployment |
| LAN traffic is plain HTTP; also blocks PWA install | Medium | installer-provisioned TLS (installer track / P-5) |
| Seed tenant present on a standalone install | Low | install profile gating seed data |
| Unattended tablets rely on browser session hygiene | Low | managed-device workstream |

## V. PRODUCTIZATION-5 readiness

P-5 (licensing and commercial distribution) is **safe to begin**, provided the
installer track also closes: a bare-host install rehearsal, TLS for the LAN
origin (which unblocks Android PWA installation), an install profile that
suppresses the seed tenant, and a tablet certification pass with a provisioned
restaurant tenant. No P-4 change touched the frozen operational core, so the
Restaurant + Bar freeze still holds.

---

## PRODUCTIZATION-4C — Final certification pass (2026-08-17)

### Evidence collected on a bare-host rehearsal install (`/tmp/nova-cert`, database `nova_cert`, ports 8100/8543/3101/55432)

| Area | Result | Evidence |
| --- | --- | --- |
| TLS on the LAN origin | PASS | `curl --cacert nova-local-ca.crt https://<lan-ip>:8543/ready` → HTTP 200, `ssl_verify_result=0`; certificate covers hostname, mDNS name and LAN IP |
| Untrusted client rejected | PASS | request without the local CA fails TLS (exit 60) |
| HTTP → HTTPS | PASS | `http://<lan-ip>:8100/admin/restaurant/pos` → 308 to the HTTPS origin |
| Network exposure | PASS | PostgREST (3101) and PostgreSQL (55432) refuse LAN connections; only the gateway is reachable |
| Installer safety | PASS | second `install.sh` run detects install `66b47d0f…` v1.2.0 and aborts with "re-run with --upgrade or --repair"; no data touched |
| Real (non-Mtoni) tenant | PASS | "NOVA Hospitality Certification Property" bootstrapped over HTTPS; admin signs in; tenant listing contains no Mtoni identifiers |
| Restaurant trading spine | PASS | catalogue → price → table → order → modifier line → production → bill → payment → receipt → close, ledgered inventory |
| Bar trading spine | PASS | same chain with bar category/tab and beverage modifier |
| Payment replay | PASS | resubmitted payment with the same request id does not duplicate |
| Purchase-order governance | FIXED, PASS | direct `draft → approved` and `draft → received` writes through the data API are now refused; `submitted → approved → partially_received → received` succeeds; a received order can no longer be cancelled |
| Backup | PASS | `novactl.sh backup` → dump + manifest, sha256 recorded |
| Restore drill | FIXED, PASS | receipts and payments deleted, restored from the artifact, counts recovered (orders 2, receipts 2, payments 2, movements 4) and the appliance returned to SYSTEM READY |
| Corrupted artifact | PASS | checksum mismatch refuses to restore |
| Secret hygiene | PASS | `/health` and `/nova/v1/system` expose versions only |
| Android tablet terminal | **FAIL** | the appliance does not serve the application UI — see blocker below |

### Defects found and fixed in this pass

1. **Purchase-order lifecycle bypass on the local appliance.** Governance lived only in the cloud server functions, so a staff token could `PATCH` a purchase order straight from `draft` to `approved` or `received` through the data API. A database trigger now enforces the same state machine (`draft → submitted → approved → partially_received → received`, cancel before terminal), on both the hosted and local runtimes.
2. **Restore could create a junk database.** A stray flag (`--yes`) was silently treated as the target database name. Arguments are now validated and unknown options rejected.
3. **Restore was unconfirmed and destructive.** Replacing a live database now requires typing the database name, or `--yes` for scripted use; non-interactive runs without `--yes` refuse.
4. **Restore failed while the appliance was trading** ("database is being accessed by other users"). Sessions are now closed before the swap, and the data service is asked to reconnect and reload afterwards.
5. **No operator route to backup/restore/diagnostics.** `novactl.sh` now exposes `backup`, `restore` and `diagnostics` alongside the lifecycle commands.

### Remaining blocker — Android tablet terminals

The gateway serves auth, bootstrap, health and the data API, but has no route that serves the application itself: every UI path returns `{"error":"Not found"}`. Browser certification at 8" and 10" tablet viewports therefore could not assess the POS layout, and PWA installability cannot be evaluated because no manifest or app shell is served from the appliance origin.

Root cause: the web application builds for the hosted Workers runtime (`preset: cloudflare-module`, server-rendered). Overriding the preset at build time does not change it. To ship tablet terminals the appliance needs an application bundle it can serve locally, plus a gateway route that serves it with SPA-style fallback and the terminal web manifest.

### Answer to the commercial question

**Can Nolmark hand NOVA Hospitality to a real hospitality customer today as a local-server product with Android tablet terminals?**

**Not yet.** The server side is genuinely ready: a clean install on a fresh machine, a real tenant provisioned, restaurant and bar trading end to end, procurement now governed at the data layer, encrypted LAN access, safe re-installation, and a proven backup/restore drill. What is missing is the terminal itself — the appliance does not yet serve the application to a tablet, so staff have nothing to open. Until the appliance ships and serves its own application bundle (and one physical Android tablet is certified against it), NOVA Hospitality can be sold as a local back-office and data appliance, not as a tablet POS product.

**STATUS: 🟡 PRODUCTIZATION-4 — SERVER APPLIANCE CERTIFIED, TABLET TERMINAL NOT CERTIFIED**

---

# PRODUCTIZATION-4D — FINAL UI SERVING + TABLET CERTIFICATION

## A. Root cause

`dist/client` contains **no `index.html`** and no application shell: the build
is an SSR artefact (`vite build` → Nitro `cloudflare-module` preset) whose HTML
is produced at request time by `dist/server/index.mjs`. The gateway only routed
`/auth/v1/*`, `/rest/v1/*`, `/nova/v1/*`, `/health`, `/ready` and returned
`{"error":"Not found"}` for everything else. Therefore `/admin/restaurant`,
`/admin/restaurant/pos`, `/admin/restaurant/bar`, `/admin/restaurant/bar/pos`
and `/admin/system/nova` had no server able to answer them on the appliance.
Nothing was broken in the client bundle — no one was serving it.

## B. Architecture decision

The Nitro `cloudflare-module` output is a **standards-based fetch handler**.
Verified: Bun can import `dist/server/index.mjs` and call
`default.fetch(request, env, ctx)` directly. The appliance therefore hosts the
*same artefact the hosted runtime deploys*, in-process inside the gateway.
No second runtime, no workerd, no forked application source, no route-specific
server implementations. The React router stays authoritative.

```
Android/HTTPS → NOVA Gateway ─┬─ /auth /rest /nova /health → APIs
                              └─ everything else → LocalAppHost
                                    ├─ dist/client/**        (static)
                                    └─ dist/server/index.mjs (SSR handler)
```

## C. Local UI serving implementation

`local/gateway/app.ts` (`LocalAppHost`):
- static assets from `dist/client` (hashed `/assets/*` immutable, `sw.js` and
  manifests `no-cache, must-revalidate`, `sw.js`/`workbox-*.js` also resolved
  from the bundle root where Vite emits them);
- path traversal contained inside the client directory;
- lazy, failure-captured load of the SSR handler — a load failure never takes
  the APIs down, it degrades health;
- `/` redirects to `NOVA_APP_ENTRY` (default `/admin`) so a terminal opening the
  appliance origin gets the OS, not the public marketing site;
- missing/truncated/corrupt bundle ⇒ neutral 503 page, no stack traces.

Verified on the appliance gateway (HTTP smoke run, DB intentionally down):
`/admin/restaurant/pos`, `/admin/restaurant/bar/pos`, `/admin/restaurant/procurement`,
`/admin/restaurant/inventory`, `/admin/restaurant/reconciliation`,
`/admin/restaurant/receipts`, `/admin/system/nova`, `/auth`, `/sw.js`,
`/nova-terminal.webmanifest` → **200**; `/rest/v1/*` and `/auth/v1/*` unknown → 404
(API precedence preserved); missing bundle → **503**, `/ready` → **503**.

## D. Hosted/local build strategy

One source, one build pipeline, two configurations:
- `bun run build:hosted` — unchanged hosted deployment.
- `bun run build:local` (`local/scripts/build-ui.sh`) — same command with
  `VITE_NOVA_RUNTIME_MODE=local` and the API origin set to the sentinel
  `https://nova-appliance.invalid`.
- `local/scripts/stamp-ui.sh` rewrites the sentinel to the real LAN origin at
  install/start time and records it in `dist/.nova-origin`.

Verified: after `build:local` + stamp, **zero** occurrences of the hosted
backend URL remain in the bundle and zero sentinels remain; all app/API traffic
is same-origin with the gateway.

## E. Gateway integration

`application-ui` is now a first-class health component. `/health` reports it,
`/ready` returns 503 when it is down, `novactl status` prints
`application READY | UNAVAILABLE | UNKNOWN`, `start.sh` binds the bundle origin
before the gateway accepts terminals and reports honest readiness afterwards.
The UI starts and stops with the appliance because it lives in the gateway
process. `/nova/v1/system` now carries `uiStatus` and `uiVersion`.

## F. Installer changes

`install.sh` builds the UI bundle if absent, **aborts** if it is still missing,
and only then starts services and asserts readiness. Existing-installation
detection and data protection are untouched.

## G. TLS

Unchanged from 4C: HTTPS on the LAN with the per-installation local CA, HTTP
308 → HTTPS, database and data service on loopback only.

## H. Android device — NOT PERFORMED

No physical Android tablet is reachable from this environment. Manufacturer,
model, Android/Chrome versions, orientation behaviour and touch ergonomics are
therefore **unverified**. Not claimed.

## I. PWA

Manifest, scope (`/admin`), `start_url` (`/admin/restaurant/pos`), icons and the
guarded registrar are served correctly from the local HTTPS origin, and control
files revalidate so a new appliance version cannot be masked by a stale worker.
Installation on a physical device is **not** certified.

## J/K. Restaurant and Bar transactions on a tablet — NOT PERFORMED

The order → send → bill → payment → receipt → close lifecycle remains verified
via the API on the appliance (4C evidence); it is **not** verified through a
physical tablet UI.

## L. Network interruption — NOT PERFORMED on device.

## M. Printing

Browser print only: **SUPPORTED WITH DEVICE/OS CONFIGURATION**. No direct
printer integration is claimed.

## N. Security

No secrets in health, system info or diagnostics; traversal blocked; bundle
failures return a neutral page; API paths keep precedence over UI paths.

## O. Regression

`bunx vitest run` → **173 passed / 14 files**; `tsgo -p tsconfig.json` → clean;
`bun run build` (local target) → success.

## P. Known limitations

1. Physical Android and PWA install certification outstanding.
2. The bundle still contains the public marketing routes of the shared source
   tree (root redirects away from them); a marketing-free local route target is
   a follow-up.
3. Web-font stylesheets are fetched from Google Fonts when the WAN is available;
   offline the UI falls back to system fonts. Self-hosting fonts is a follow-up.

## Q. Final verdict

🟡 **PRODUCTIZATION-4 IMPLEMENTED — PHYSICAL ANDROID CERTIFICATION PENDING**

The appliance now serves the real NOVA Hospitality UI over HTTPS on the LAN with
honest readiness. Commercial tablet certification requires a physical device.

---

# PRODUCTIZATION-4E — PHYSICAL DEVICE CERTIFICATION

## Evidence status

**NOT VERIFIED — no physical Android tablet is reachable from this environment.**

This build/verification environment is a headless Linux sandbox. It has no
Android device attached, no ADB target, no LAN with tablets on it, and no way to
put hands on a screen. Every acceptance item in sections 1–11 of the
Productization-4E brief requires a real device, and the brief explicitly forbids
substituting desktop Chrome emulation, responsive mode, screenshots, or
theoretical compatibility. No substitute was used and no device claim is made.

| Item | Result | Evidence class |
| --- | --- | --- |
| Device details (make/model/Android/Chrome/resolution/Wi-Fi) | none recorded | NOT VERIFIED |
| LAN connection from tablet | not performed | NOT VERIFIED |
| HTTPS / certificate acceptance on device | not performed | NOT VERIFIED |
| Authentication on device (login → admin → restaurant → bar → logout → login) | not performed | NOT VERIFIED |
| Restaurant POS full service lifecycle on device | not performed | NOT VERIFIED |
| Bar POS distinct lifecycle on device | not performed | NOT VERIFIED |
| Portrait behaviour | not performed | NOT VERIFIED |
| Landscape / rotation during operation | not performed | NOT VERIFIED |
| PWA install offered / installed / launched from home screen | not performed | NOT VERIFIED |
| Service worker + cache version on device | not performed | NOT VERIFIED |
| Network interruption (Wi-Fi off/on) on device | not performed | NOT VERIFIED |
| Service stop/restart recovery observed from device | not performed | NOT VERIFIED |
| Printing from device browser | not performed | NOT VERIFIED |
| Transaction integrity created *by the tablet* (no duplicates) | not performed | NOT VERIFIED |
| Security inspection from the device browser/network | not performed | NOT VERIFIED |

## What remains verified from earlier sprints (unchanged, not re-claimed as device evidence)

| Item | Result | Evidence class |
| --- | --- | --- |
| TLS on the LAN origin, HTTP→HTTPS 308, DB/data service loopback-only | pass | CODE/HOST VERIFIED (4C) |
| Appliance serves the real NOVA UI; POS, bar, procurement, inventory, reconciliation, receipts, system, `/auth`, `/sw.js`, terminal manifest → 200 | pass | CODE VERIFIED (4D) |
| `/` redirects terminals to the OS entry point | pass | CODE VERIFIED (4D) |
| Missing/corrupt UI bundle → 503 and `/ready` → 503 | pass | CODE VERIFIED (4D) |
| Path traversal blocked; API paths keep precedence | pass | CODE VERIFIED (4D) |
| Local bundle contains no hosted backend URL, no sentinel; same-origin API | pass | CODE VERIFIED (4D) |
| Manifest, scope `/admin`, start URL `/admin/restaurant/pos`, icons served over local HTTPS | pass | CODE VERIFIED (4D) |
| Restaurant and bar order→payment→receipt→close integrity, ledger and inventory movements | pass | API VERIFIED (4C) |
| Backup / restore / disaster recovery drill | pass | HOST VERIFIED (4C) |
| Printing | browser print only | SUPPORTED WITH DEVICE/OS CONFIGURATION — no printer physically verified |

## Regression (this sprint, 2026-08-17)

- `bunx vitest run` → **173 passed / 14 files**, exit 0.
- `bunx tsgo -p tsconfig.json` → **clean**, exit 0.
- `bun run build` → **success**, exit 0.

No tests were weakened, skipped, or altered. No product code was changed in 4E.

## Verdict

🟡 **PRODUCTIZATION-4 IMPLEMENTED — PHYSICAL CERTIFICATION PENDING**

The appliance is functionally complete and regression-clean. Closure requires a
human running the 4E script on at least one physical Android tablet on the
appliance LAN and recording the device details and results in this section.
