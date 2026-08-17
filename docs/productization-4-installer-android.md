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
