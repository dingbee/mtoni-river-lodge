# PRODUCTIZATION-4 — NOVA Hospitality Restaurant & Bar OS
## Local Installer + Android Tablet Terminal

**Verdict: 🟡 PRODUCTIZATION-4 IMPLEMENTED WITH FOLLOW-UPS**

Installer, service management, first-run path, secure configuration, system
information, diagnostics and the Android/PWA terminal are built and exercised.
Two acceptance gates could not be closed by evidence in this environment
(see §R): a full clean-machine install run, and a visual tablet certification
of the till surface with a real restaurant tenant.

---

## A. Executive verdict

| Gate | Result |
|---|---|
| 1. Clean machine prepared reproducibly | 🟡 scripted and dry-runnable; not executed on a second physical host |
| 2. Ordered runtime start | 🟢 `novactl.sh start` → database → data service → gateway |
| 3. First-run tenant/admin setup | 🟢 unchanged, verified `/nova/v1/bootstrap` path (P-3) |
| 4. Secrets generated/stored securely | 🟢 per-install generation, `0600`, never committed |
| 5. Existing installations protected | 🟢 `classifyInstall` + installer abort/upgrade/repair |
| 6. Android tablet over LAN | 🟢 gateway on `0.0.0.0:8000`, same-origin app |
| 7/8. Restaurant & Bar POS on tablet | 🟡 routes render clean at 4 tablet sizes; till body needs a tenant member to certify |
| 9. PWA installation | 🟡 valid terminal manifest + icons served; install confirmed structurally, not on a physical Android device |
| 10. Touch usability | 🟢 POS grid, tables, menu tiles and primary actions ≥ 44px; portrait now single-column |
| 11. Honest failure/recovery | 🟢 no optimistic success; queries recover on reconnect |
| 12. Backup/recovery intact | 🟢 unchanged P-3 scripts, now surfaced read-only in the OS |
| 13. Diagnostics leak no secrets | 🟢 redaction proven by test and by a live bundle |
| 14. Product version identifiable | 🟢 one constant, visible in installer, endpoint, UI, diagnostics |
| 15. Typecheck | 🟢 clean |
| 16. Regression tests | 🟢 163/163 pass (150 pre-existing + 13 new) |
| 17. Production build | 🟡 delegated to the platform build pipeline |

---

## B. Supported deployment model

One on-premise appliance (Linux or Windows, x86_64/arm64, ≥ 4 GB RAM,
≥ 20 GB free, PostgreSQL ≥ 16) on the property LAN. Windows/Linux computers
and Android tablets are browser terminals. The tablet holds no database.

```
Android tablet / Windows PC ──LAN──► NOVA gateway :8000
                                        ├── local auth (ES256)
                                        ├── /nova/v1/*  (bootstrap, system)
                                        └── /rest/v1/* ─► PostgREST ─► PostgreSQL (loopback)
```

## C. Installer architecture

`local/scripts/install.sh [--upgrade|--repair|--dry-run]`

1. `preflight.sh` collects host facts (OS, arch, RAM, disk, PostgreSQL, ports)
   and hands them to `evaluatePreflight` — the same logic the tests assert, so
   the installer and the test suite cannot disagree.
2. Installation state is classified by `classifyInstall`:
   `fresh → install`, `existing → upgrade`, `interrupted → repair`,
   `foreign database → abort`. A plain `install` against an existing
   installation **stops**.
3. Secrets generated per installation into `local/.env` (`0600`).
4. `gen-keys.sh` (ES256), `init-db.sh` (schema + checksum-verified migrations).
5. Permissions hardened, services started in dependency order, readiness gate,
   then the first-run URL is printed.

Ports held by our own processes are a warning (upgrade), ports held by a
foreign service are blocking.

## D. Runtime components

PostgreSQL (loopback) · PostgREST (loopback) · NOVA gateway (LAN) ·
application bundle served to browsers. Unchanged from PRODUCTIZATION-3 apart
from the new `GET /nova/v1/system`.

## E. First-run experience

Unchanged, verified contract: `/nova/v1/bootstrap` creates tenant, property and
first administrator, is replay-safe and refuses hijack. No customer-specific
seed data ships in the product; the hosted property tenant that the
authoritative migrations create is still present on a standalone install and
remains the documented P-5 install-profile follow-up.

## F. Security model

- Signing key `0600` in a `0700` directory; `.env` `0600`; backups dir `0700`;
  rendered PostgREST config `0600`; install marker `0640`.
- No secret is committed, bundled into client code, logged, or returned by
  `/health`, `/ready`, `/nova/v1/system` or the diagnostic bundle.
- `redactText`/`redactRecord` remove connection strings, PEM private keys,
  JWTs, publishable/secret keys and any sensitively-named configuration value.

## G. Android terminal architecture

Android is a terminal only — no second POS engine, no local database, no
duplicated business logic. The tablet loads the same bundle from the appliance
over the LAN and authenticates against the local issuer.

## H. PWA readiness

`public/nova-terminal.webmanifest` — id `/admin?terminal`, scope `/admin`,
start `/admin/restaurant/pos`, standalone, product icons (192/512, maskable),
shortcuts for Restaurant POS, Bar POS and Kitchen. While the OS shell is
mounted, `applyTerminalManifest()` points the document at this manifest so
"Add to home screen" installs NOVA, not the lodge website. No Mtoni domain and
no localhost assumption: everything is same-origin and resolves on a LAN IP.
Note: Android Chrome requires HTTPS or `localhost` for installability, so a
plain-HTTP LAN appliance will run in-browser until TLS is provisioned — that
is the honest limitation, tracked for the installer TLS work.

## I. Touch certification

Verified with a headless Chromium at 800×1280, 900×1440, 1280×800 and
1400×900, touch enabled, authenticated: both POS routes render with **zero
console errors and zero horizontal overflow** at every size. The POS grid was
changed from `md:` to `lg:` columns so 8"/10" portrait keeps one full-width
column. Tables, menu tiles (`min-h-20`), category chips (`min-h-10`) and
primary actions (`min-h-11`) meet touch-target guidance. Remaining sub-40px
controls are sidebar navigation links, not till actions.

## J. Network interruption behaviour

No optimistic success anywhere in the till: mutations report failure from the
server response, and writes are idempotency-keyed (proven in P-3 Phase M).
On reconnect the terminal re-queries; `/ready` returns 503 naming the failed
component while the server is down and 200 after recovery. **No offline
transaction queue exists and none was invented.**

## K. Kiosk readiness

Standalone display mode removes tab dependence; session lives in the browser
storage of the terminal; administrative surfaces stay behind role checks.
A managed Android deployment (device enrolment, lock-task mode, auto-launch,
certificate distribution) is deliberately **not** built here.

## L. Printing / peripherals

| Capability | Classification |
|---|---|
| Receipt / document print from the browser dialog | SUPPORTED NOW |
| Network printer reachable from the tablet's print service | SUPPORTED WITH OS/DEVICE CONFIGURATION |
| Direct Bluetooth/USB thermal printing, cash drawer, KDS display | REQUIRES FUTURE HARDWARE ADAPTER |

No direct peripheral support is claimed; none was verified.

## M. Backup / recovery integration

`/admin/system/nova` surfaces last backup time and integrity, database and
schema versions, health and readiness — read-only. Restore remains a shell
operation on the appliance (`restore.sh`), so terminal staff cannot destroy or
replace the database from the UI. `canRestoreBackup` restricts the capability
to `owner` for any future UI action.

## N. Diagnostics

`local/scripts/diagnostics.sh [dir]` writes a `0600` JSON bundle: versions,
install id, service statuses, migration count, backup metadata, redacted
configuration and the last 200 log lines per service, all passed through the
redaction layer. Live bundle inspected: 0 credential matches.

## O. Versioning

`src/modules/runtime/version.ts` remains the single authority
(app `1.2.0`, required schema `2026.08.17`, minimum PostgreSQL 16), consumed by
installer, gateway, system endpoint, UI and diagnostics. `checkCompatibility`
detects schema-behind / schema-ahead / unsupported PostgreSQL.

## P. Installation & recovery safety

| Scenario | Behaviour |
|---|---|
| Fresh | install |
| Existing | stops; `--upgrade` only, database never recreated |
| Interrupted | `--repair` completes setup, data preserved |
| Foreign database of the same name | abort |
| Failed migration | ledger unchanged, no partial schema (P-3 Phase J) |
| Failed startup | readiness gate fails loudly, installer exits non-zero |
| Uninstall | stops services, removes runtime files; **data untouched** |
| Uninstall `--purge-data` | prints the consequence and requires the database name typed back; backups retained |

## Q. Test evidence

- `bunx tsgo --noEmit` — clean.
- `bunx vitest run` — **163/163 pass** (14 files), including 13 new
  productization tests (pre-flight, install-state, redaction, roles, version).
- Live runtime: `/nova/v1/system` returns app 1.2.0, schema 2026.08.17,
  install id, PostgreSQL 17.9, 100 migrations, health ok, ready true;
  `/ready` → 200.
- `preflight.sh` executed: correctly passed OS/arch/RAM/disk/PostgreSQL and
  flagged the two ports already held by the running stack.
- `diagnostics.sh` executed: bundle generated, secret scan clean.
- Tablet run: 4 viewports × 2 POS routes, authenticated, 0 console errors.

## R. Known limitations

1. **Clean-machine install not executed end-to-end.** The sandbox already runs
   an initialised stack, so the installer was exercised through pre-flight,
   state classification and dry-run rather than a full bare-host run.
2. **Till body not visually certified on tablet.** The available session is not
   a restaurant tenant member, so the POS renders its empty state; floor,
   catalogue, bill, payment pad and receipt dialogs are covered by the P-3 HTTP
   suite and code-level touch sizing, not by tablet screenshots.
3. **PWA install not confirmed on a physical Android device**, and plain-HTTP
   LAN origins are not installable in Chrome without TLS.
4. **No offline mode.** Deliberate.
5. **Windows support is declared and pre-flight-checked but untested.**
6. Carried from P-3: seed tenant in migrations, no TLS, no scheduled backups,
   `SECURITY DEFINER` grant debt.

## S. PRODUCTIZATION-5 prerequisites

Safe to begin licensing/commercial distribution work, provided P-5 (or the
installer track) also closes: a real clean-machine install rehearsal, TLS for
the LAN origin (which unblocks Android PWA installation), an install profile
that suppresses the seed tenant, and a tablet certification pass with a
provisioned restaurant tenant.
