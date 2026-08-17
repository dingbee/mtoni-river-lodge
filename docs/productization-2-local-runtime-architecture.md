# PRODUCTIZATION-2 — NOVA Hospitality Local Runtime Architecture Audit

Status: audit only. **No source, schema, or business logic was modified in this sprint.**
Date: 2026-08-17. Scope: `src/modules/restaurant/**` (NOVA Hospitality OS core), its host
platform seams, and `supabase/migrations/**` (100 files).

---

## A. Executive verdict

🟡 **READY FOR PRODUCTIZATION-3 WITH DOCUMENTED BLOCKERS**

The hospitality core is far more portable than expected. The decisive finding:

> **NOVA Hospitality OS never talks to Supabase-the-product. It talks to PostgREST-over-Postgres
> plus one JWT verification call.** Across all 31 server-function modules in
> `src/modules/restaurant/**` there are **zero** uses of `supabase.auth.*`, Supabase Storage,
> Supabase Realtime, Edge Functions, `pg_net`, `pgmq`, `vault` or `pg_cron`. Grep for
> `supabase.auth|.storage.|.channel(|postgres_changes` inside the module returns nothing.
> Every module's only import from the platform is `requireSupabaseAuth`
> (e.g. `src/modules/restaurant/bar/bar.functions.ts:2`).

That reduces "make it local" from a rewrite to **three adapters**:

1. **Identity adapter** — 391 `auth.uid()` call sites in RLS predicates and SECURITY DEFINER
   helpers, zero `current_setting()` usage. This is the single largest item (Blocker B1).
2. **Data-access adapter** — the app speaks PostgREST verbs (`.from()`, `.rpc()`), so NOVA Local
   must either ship PostgREST or implement a thin equivalent (Blocker B2).
3. **Auth issuance adapter** — `requireSupabaseAuth` validates a Supabase-issued JWT
   (`src/integrations/supabase/auth-middleware.ts:61`, `supabase.auth.getClaims`). A local issuer
   must mint equivalent claims (Blocker B3).

Nothing in the transactional core (POS, inventory, procurement, pricing, receipts, documents,
reconciliation) requires the Internet by design. Verified blockers to offline service are narrow
and all peripheral: receipt *delivery* (email/WhatsApp), Intelligence, and today's auth token
refresh path.

**Recommended local runtime: option C — a local server appliance (Node runtime + local
PostgreSQL + PostgREST-compatible data layer) accessed from terminals through the browser**, with
an *optional* desktop shell added later purely as an installer/tray convenience. Evidence in §H/§I.

---

## B. Current runtime architecture

```
Browser (React 19 / TanStack Start, PWA)
  │  useServerFn(...)  — RPC over same-origin HTTP
  ▼
TanStack Start server functions  (31 modules under src/modules/restaurant)
  │  .middleware([requireSupabaseAuth])  → validates Bearer JWT, builds per-request client
  ▼
supabase-js (PostgREST wire protocol)  — .from() / .rpc()
  ▼
PostgreSQL   RLS + SECURITY DEFINER helpers = the real enforcement point
```

Key structural facts, all evidence-backed:

- Deployment target today is a Cloudflare Worker (`wrangler.jsonc`, `nodejs_compat`). The server
  layer is edge/stateless — **no in-process state to port**, which is what makes relocating the
  runtime to a local Node process tractable.
- Enforcement is layered deliberately: `src/modules/restaurant/core/access.server.ts:5-6` states
  app-level `assertCapability` is fast-fail UX and "RLS is the enforcement point".
  `core/permissions.ts:9-10` repeats it. This is exactly the property that must be preserved.
- Documents/printing are **entirely client-side**: `documents/rendering/toHtml.ts` produces a
  standalone styled HTML document; `documents/print/print.ts:8-29` prints it via an off-screen
  iframe; `downloadDocumentPdf = printDocument` (`print.ts:32`) — no PDF engine, no server render.
  XLSX export lazily imports `xlsx` in the browser (`documents/exports/xlsx.ts:8`).
- The only Postgres RPCs the module calls are its own plpgsql: `restaurant_next_document_number`
  (5 call sites) and the platform `has_any_role` (`core/access.server.ts:14-17`).

---

## C. Complete dependency inventory (runtime-traced)

| # | Dependency | Where it actually executes | Evidence |
|---|---|---|---|
| 1 | PostgreSQL (data, constraints, triggers, sequences) | every write path | 100 migrations, 132 triggers |
| 2 | PostgREST wire protocol via `supabase-js` | all `.from()`/`.rpc()` calls | 31 `*.functions.ts` modules |
| 3 | Supabase Auth (JWT issue + `getClaims` verify) | request middleware | `auth-middleware.ts:11-76` |
| 4 | RLS identity `auth.uid()` / `auth.role()` | inside Postgres | 391 occurrences, 0 `current_setting` |
| 5 | `auth.users` FK targets | schema | 24 migration files |
| 6 | Supabase Storage | media, KB docs, check-in docs — **not restaurant** | `storage.objects` policies in 3 migrations |
| 7 | Supabase Realtime | notifications + arrivals only | `src/lib/notifications.ts:101`, `useArrivals.ts:22` |
| 8 | Service-role admin client | one narrow public-receipt read | `receipts/delivery.server.ts:423-464` |
| 9 | Lovable AI Gateway | Intelligence + concierge | `src/lib/ai-gateway.server.ts`, `LOVABLE_API_KEY` |
| 10 | Email (queue → sender) | receipt/booking email | `send-internal.server.ts:139` `enqueue_email` |
| 11 | `pgmq` / `pg_net` / `supabase_vault` / `pg_cron` | email infra + 1 cron job | `20260623144039_email_infra.sql:6-13`; `20260717171226:441` |
| 12 | Twilio WhatsApp via Lovable connector gateway | receipt delivery | `delivery.server.ts:32,320-346` |
| 13 | Pesapal payment gateway | **lodge bookings only**, not restaurant | `src/lib/pesapal.server.ts` |
| 14 | Browser APIs: `window.print`, Blob/ObjectURL, iframe, localStorage, service worker | client | `print.ts`, `src/lib/pwa/register.ts` |
| 15 | Filesystem APIs | none in restaurant core | — |
| 16 | Env vars | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `TWILIO_API_KEY`, `WHATSAPP_FROM`, `EMAIL_SENDING_DISABLED`, `PUBLIC_APP_URL` | mixed |
| 17 | External URLs baked in | `connector-gateway.lovable.dev`, `ai.gateway.lovable.dev`; Mtoni domain only in lodge marketing code | grep |
| 18 | Cron/background | one job: `expire-booking-holds` (lodge) | `20260717171226:441` |
| 19 | Webhooks | payment + email callbacks (lodge) | `src/routes/api/public/**` |
| 20 | External monitoring | none — observability writes to own tables | `src/lib/observability/**` |

Notably absent from the restaurant core: payment-gateway calls (payment method is a recorded enum
value in `sales/pos.contracts.ts:17`, never processed online), pgvector, and any Edge Function.

---

## D. Classification (Phase 2)

**A. LOCAL REQUIRED** — must run on-premise or service stops.
- PostgreSQL + the schema. It *is* the transactional source of truth.
- PostgREST-compatible data layer. Every read/write goes through it; nothing else exists.
- Identity/session verification. Without a valid JWT, `requireSupabaseAuth` throws before any query.
- Document numbering RPC (`restaurant_next_document_number`) — plpgsql, portable, must be local
  because receipts cannot be issued without a number.
- Client print pipeline. Already local by construction (browser iframe print).

**B. LOCAL + CLOUD ABSTRACTION** — needs both implementations behind one interface.
- Auth issuance (local password store vs Supabase Auth) — same claim shape either way.
- Object storage (KB docs, media, check-in documents) — S3/MinIO/filesystem vs Supabase Storage.
- Realtime change propagation — Postgres `LISTEN/NOTIFY` or WebSocket fan-out vs Supabase Realtime.
- Queue + scheduler (`pgmq`, `pg_cron`) — local worker/table queue + OS timer vs Supabase extensions.
- Secrets (`supabase_vault`) — local encrypted config vs vault.
- Public-origin resolution — already abstracted in PRODUCTIZATION-1 (`core/product.ts`).

**C. CLOUD OPTIONAL** — helpful, must never block service.
- Intelligence / AI Gateway. Already degrades cleanly: it reads and recommends, never writes
  transactional state.
- Email receipt delivery — `emailProviderConfigured()` gate (`delivery.server.ts:44-48`).
- WhatsApp receipt delivery — `whatsappProviderConfigured()` gate with a `wa.me` manual fallback
  (`delivery.server.ts:309-318`). This is already the correct optional-service pattern.
- Cloud backup, remote reporting, telemetry, update distribution.

**D. EXTERNAL INTEGRATION (Integration Hub, later)**
- Mtoni PMS folio (`src/domains/hospitality/folio/**` + `sales/roomcharge.server.ts`) — already an
  isolated adapter seam.
- Twilio, email providers, payment terminals/gateways, KDS hardware, accounting exports.

**E. NOVA CORE CANDIDATE** — see §P.

**F. MTONI/CUSTOMER-SPECIFIC**
- Lodge domains: bookings, guests, front desk, online check-in, journal/CMS, SEO, Pesapal,
  WLHA campaign, marketing site. Also the single `expire-booking-holds` cron job and the
  `mtoniriverlodge.com` strings, all confined to lodge code.

---

## E. Database feasibility (Phase 3)

**Verdict: the schema runs on stock PostgreSQL 16 + `contrib` after an identity shim. No redesign.**

Runs unchanged: all tables, 48 enums, 3 generated columns, 132 triggers, all indexes/constraints/FKs
between `public` tables, RLS *mechanics* (core Postgres), and the majority of SECURITY DEFINER
business helpers. `citext`, `pg_trgm`, `fuzzystrmatch`, `pgcrypto` all ship in `postgresql-contrib`.
No pgvector anywhere — the "search" column is a core `tsvector GENERATED ALWAYS AS`
(`20260717104421:56`).

Needs adaptation, in priority order:

1. **Identity (B1).** 391 `auth.uid()`/`auth.role()` references, plus `auth.users` FKs in 24
   migrations. Two credible routes:
   - *Shim (recommended)* — create an `auth` schema locally holding a `users` table and
     `auth.uid()`/`auth.role()` functions reading a per-connection GUC
     (`current_setting('request.jwt.claims')`, the same GUC PostgREST already sets). **Zero policy
     rewrites, zero migration edits, one new bootstrap migration.** Backwards compatible with the
     hosted deployment.
   - *Rewrite* — convert every policy to `current_setting('app.user_id')`. Higher risk, touches 205
     RLS-enabled tables, weakens the "don't modify frozen core" rule. Rejected.
2. **Roles.** `anon`, `authenticated`, `service_role` do not exist on stock Postgres. Create them in
   the bootstrap migration; the 67 GRANT statements then apply verbatim.
3. **`extensions` schema.** A Supabase convention; create it as a plain schema so qualified calls
   (`extensions.gin_trgm_ops`, `extensions.soundex`) resolve.
4. **`pgmq` / `pg_net` / `supabase_vault` / `pg_cron`** — all confined to the duplicated
   `email_infra` migrations plus one cron job. `pg_net` is installed but never actually called from
   SQL (comment only). For NOVA Local: drop `pg_net` and `supabase_vault`, replace `pgmq` with a
   table-backed queue behind the existing four wrapper functions (`enqueue_email`,
   `read_email_batch`, `delete_email`, `move_to_dlq` — the interface is already correct), and replace
   `pg_cron` with a local scheduler.
5. **`storage.objects` policies** (3 migrations, none restaurant) — authorization moves to the
   storage adapter's app layer.
6. **Hygiene, not portability:** two near-identical `email_infra` migrations
   (`20260623144039` / `20260623144233`); and a later migration re-grants `has_any_role`/`is_any_staff`
   EXECUTE to `anon` (`20260717175926:2,4`) after an earlier revoke — flagged for review in §R, not
   changed here.

---

## F. Authentication feasibility (Phase 4)

Current model: Supabase Auth issues the JWT; the browser attaches it
(`src/integrations/supabase/auth-attacher.ts`); `requireSupabaseAuth` verifies with
`getClaims` and constructs an RLS-scoped client; Postgres derives identity via `auth.uid()`;
roles come from `public.user_roles` (platform, via `has_any_role`) and `restaurant_members`
(per-tenant, via `restaurant_can_read/write`).

Recommended local architecture (**not implemented in this sprint**):

- **Local identity provider** inside the NOVA Local runtime: `auth.users` table with Argon2id
  password hashes, issuing the *same claim shape* (`sub`, `role`, `exp`) signed with a
  locally-generated HS256/EdDSA key stored in local secure config.
- **Unchanged downstream.** `requireSupabaseAuth` becomes `requireNovaAuth` with two providers
  behind one interface; the context contract (`{ supabase, userId, claims }`) is preserved so no
  restaurant module changes.
- **First administrator**: created by the installer through a one-time, localhost-only setup token —
  never a default password. Closes the PRODUCTIZATION-1 open item (tenant + first admin creation).
- **Sessions**: short-lived access token + long-lived refresh token bound to a `terminal_id`, so a
  POS terminal survives a runtime restart mid-service.
- **Offline authentication**: because the token is verified by the *local* server, sign-in works with
  no Internet at all. This is a strict improvement on today's behaviour.
- **Password reset / admin recovery**: manager-initiated reset in-app; break-glass recovery via a
  console command on the NOVA Local server host (physical access = authority), audit-logged.
- **Capability model preserved conceptually**: `restaurant_members` + `rolesForCapability` +
  RLS stay exactly as they are.

---

## G. Offline capability matrix (Phase 5)

Assumption: NOVA Local server + terminals on the same LAN; "offline" = LAN intact, WAN lost.
This is the realistic restaurant failure mode. (LAN loss is handled in §J, not here.)

| Feature | Works offline | Partially | Requires Internet | Reason |
|---|---|---|---|---|
| POS (open/add/void/transfer/pay/close) | ✅ | | | All writes are Postgres via server fns; no external call in the path |
| Bar POS | ✅ | | | Same engine, category-filtered |
| Kitchen / firing | ✅ | | | `kitchen.functions.ts` → DB only |
| Inventory & stock movements | ✅ | | | Ledger-only writes, DB-side |
| Procurement (PR/PO/GR/SI, 3-way match) | ✅ | | | State machine is app+DB code |
| Requisitions | ✅ | | | DB only |
| Pricing / readiness | ✅ | | | Server-side resolution, no external quote source |
| Receipt generation & printing | ✅ | | | Client HTML + `window.print()` (`print.ts:8-29`) |
| Documents (all types) / CSV / XLSX | ✅ | | | Rendered in-browser; `xlsx` lazily imported (bundled) |
| Reconciliation | ✅ | | | DB aggregation |
| Authentication (post-P3 local issuer) | ✅ | | | Locally verified token |
| Authentication (today, hosted) | | | ❌ | Token refresh hits Supabase Auth — Blocker B3 |
| Realtime board updates | | ⚠️ | | Today Supabase Realtime; POS already polls/invalidates via React Query, so it degrades to refetch |
| Local backups | ✅ | | | `pg_dump` on the local server |
| Email receipt delivery | | ⚠️ | | Queues locally, drains when WAN returns — gate already exists |
| WhatsApp receipt delivery | | ⚠️ | | Falls back to `wa.me` share link (`delivery.server.ts:309-318`) |
| Card/mobile-money capture | | | ❌ | Provider terminals need WAN; cash/room-charge unaffected |
| Intelligence / AI | | | ❌ | AI Gateway is remote; advisory only, blocks nothing |
| PMS room charge (Mtoni) | | ⚠️ | | Local if PMS is on the same LAN; the adapter already returns `status: "unknown"` rather than assuming (`folioAdapter.server.ts:129-137`) |
| Cloud backup / remote reporting | | | ❌ | By definition |

**Genuine blockers to "restaurant keeps serving during Internet loss":** only B1–B3 (identity, data
layer, auth issuance). Every operational engine is already Internet-independent. No offline
faking is required — and none should be added: an offline write queue in the browser would create a
second source of truth, violating rule 7.

---

## H. Local runtime options (Phase 6)

| Criterion | A. Node runtime + PG + browser | B. Tauri/Electron desktop shell | C. Local server appliance, browser terminals |
|---|---|---|---|
| Installation complexity | Medium (2 services) | High (shell + embedded server + PG) | Medium (one installer, one machine) |
| Windows | Good | Good | Good (service + PG installer) |
| Linux | Good | Good | Excellent |
| Resources | Low | High per terminal (a Chromium per till) | Low per terminal |
| Security | Good | Larger attack surface | Good — single hardened host |
| Local networking | Native | Awkward: each shell is an island | **Native and central** |
| Printing | Browser dialog only | Native/silent printing possible | Browser now, local print service later |
| Hardware access | Limited | Best | Via local hardware service (§K) |
| Updates | Server-side, one place | Per-terminal updater | **One machine to update** |
| DB management / backup | Straightforward | Embedded PG is painful to back up | Straightforward |
| Offline | Yes | Yes | Yes |
| Multi-terminal | Yes | **No — N databases** | **Yes, by design** |
| Commercial distribution | Scripted installer | App store-ish polish | Installer + optional appliance image |
| Cloud compatibility | Identical code | Diverges | **Identical code** |
| Dev effort | Low | High | Low–Medium |
| Fit with current codebase | High | Medium | **Highest** |

Option B is disqualified as the *primary* architecture by Phase 7's requirement: a restaurant has
several terminals sharing one order book. A desktop shell per terminal either duplicates the
database (forbidden — rule 7) or degenerates into option C with extra weight.

---

## I. Recommended local runtime (Phase 6 decision)

> **NOVA Local = a single on-premise appliance running: PostgreSQL 16 + the existing TanStack Start
> server bundle on Node + a PostgREST-compatible data layer + a local auth issuer. Terminals are
> browsers on the LAN. A Tauri tray shell may later wrap *the server* for installer/UX polish, and
> optionally each terminal for silent printing — never as the data owner.**

Why this and not the others:

- The server layer is already stateless and edge-portable (`wrangler.jsonc`); running the same
  bundle under Node changes deployment, not code.
- Multi-terminal, concurrent-write correctness is already solved *in Postgres* (state machines,
  optimistic concurrency in `receiving.server.ts`, idempotency keys in the folio adapter). Any
  architecture with more than one database throws that away.
- One codebase serves NOVA Local, Hybrid and Cloud — rule 19 (backward compatibility) satisfied.

Ship PostgREST alongside Postgres rather than replacing `supabase-js` call sites: it is a single
static binary, speaks the exact protocol 31 modules already use, and reads identity from the same
`request.jwt.claims` GUC the identity shim targets. Estimated blast radius: **0 restaurant files.**

---

## J. Multi-terminal architecture (Phase 7)

```
NOVA LOCAL SERVER (one host)
  ├── PostgreSQL 16          ← single source of truth
  ├── NOVA runtime (Node)    ← server functions, auth issuer
  └── Local services         ← queue/scheduler, print router, backup agent
        │  LAN (HTTPS, local CA or mDNS name)
        ├── POS 1   ├── POS 2   ├── Bar   ├── Kitchen/KDS   └── Manager / back-office
```

- **Discovery**: mDNS/Bonjour (`nova.local`) with a static-IP fallback printed by the installer.
- **TLS**: locally-issued certificate installed by the installer — required anyway for service
  workers and secure contexts.
- **Authentication**: same JWT flow; each terminal registers once and receives a `terminal_id`
  bound to its refresh token.
- **Concurrent writes**: unchanged — Postgres transactions, the existing state machines, and
  optimistic concurrency already govern order/PO lifecycles.
- **Terminal identification**: needed for printer routing and audit attribution. A `terminal_id`
  claim is additive; it does not alter existing capability checks.
- **Terminal offline (LAN loss at one till)**: read-only degradation with an explicit banner. No
  local write queue — that would create a second source of truth.
- **Server failure**: documented as the accepted single point of failure for NOVA Local v1;
  mitigations (hot standby, warm spare restore) are a NOVA Enterprise concern.

---

## K. Hardware & printing architecture (Phase 8)

Today: 100% browser printing through an off-screen iframe (`print.ts`). That is genuinely portable
and works offline, but has hard browser limits — a print dialog per document, no printer *selection*
by station, no cash-drawer kick, no ESC/POS, no scanner or customer-display access.

Required for a credible local product: **a NOVA Local Hardware Service** on the server host —
a small local daemon exposing a narrow HTTP contract (`POST /print`, `POST /drawer/open`) that maps
*logical stations* (`receipt`, `kitchen`, `bar`) to physical devices, speaking ESC/POS to network or
USB printers. Terminals request a logical station; the server routes it. Kitchen tickets then print
without anyone standing at a till.

Sequencing: browser printing stays the fallback forever; the hardware service is
PRODUCTIZATION-7. Barcode scanners work today as keyboard-wedge devices with no integration.
Payment terminals belong to Integration Hub, not the core.

---

## L. Backup & restore architecture (Phase 9)

Must include: the Postgres cluster (all `public` data, sequences, enums, functions), the object
store (documents/media), local configuration and signing keys, and the schema-version marker.

Design (not implemented): nightly `pg_dump --format=custom` plus a weekly full base backup, written
to a configured local path and optional external drive; AES-256 encryption with a key escrowed at
install time; retention policy; **automatic verification by restoring into a scratch database and
asserting row counts and the migration version**; one-command restore; machine migration = restore
plus re-issue of terminal certificates. Optional NOVA Cloud Backup uploads the same encrypted
artifact — never a precondition for local backups succeeding.

---

## M. Update & migration architecture (Phase 10)

- **Versioning**: the existing timestamped migration files remain the schema version ledger; the app
  bundle carries a `minimum_schema_version` and refuses to start below it rather than guessing.
- **Backup before migration**: mandatory, automatic, verified — the updater aborts if the pre-flight
  backup does not verify.
- **Validation**: migrations run in a single transaction where possible; post-migration smoke
  assertions (row counts, RLS enabled, critical functions present) before the new bundle is
  activated.
- **Failure recovery**: failed transaction rolls back; failed post-check restores the pre-flight
  backup and reactivates the previous bundle.
- **Rollback**: application rollback is supported (keep N-1 bundle); *schema* rollback is explicitly
  not, in line with forward-only migration discipline — hence the mandatory backup.
- **Compatibility**: additive-first migrations, so a terminal running an older cached client keeps
  working through one version skew.

---

## N. Cloud boundary (Phase 11)

**NOVA Hospitality OS (must run without WAN):** POS, Bar, Kitchen, Inventory, Recipes, Procurement,
Pricing, Payments *recording*, Receipts, Documents, Reconciliation, identity, capabilities, tenancy,
events, audit, local backup, printing.

**NOVA Cloud Services (all optional):** remote management, cloud backup, remote/multi-property
reporting, multi-property administration, AI/Intelligence services, outbound notifications
(email/WhatsApp), licensing & activation, telemetry/health, update distribution.

Rule to encode in code review: **no cloud service may sit in a transactional write path.** Today's
receipt-delivery gates (`emailProviderConfigured`, `whatsappProviderConfigured`) are the reference
pattern; Intelligence must stay advisory-only.

---

## O. Integration Hub boundary (not started)

Belongs to the Hub, never the core: PMS/folio (the existing adapter is the prototype contract),
accounting exports, payment providers and terminals, KDS hardware protocols, supplier EDI, loyalty,
external identity (SSO). The Hub's contract shape should be modelled on
`src/domains/hospitality/folio/folio.contracts.ts` + `folioAdapter.server.ts`, which already gets
the hard part right: every attempt — success, refusal, or *no answer* — is journaled, and an
unanswered integration is `status: "unknown"`, not a failure.

---

## P. NOVA Core candidates (no extraction yet)

| Candidate | Current location | Why it qualifies |
|---|---|---|
| Identity primitives | `auth-middleware.ts`, `user_roles`, `has_any_role` | Nothing hospitality-specific; every NOVA product needs it |
| Capability framework | `restaurant/core/permissions.ts`, `access.server.ts` | Generic capability→role map + RLS mirroring |
| Tenant framework | `restaurant_tenants`, `restaurant_members`, `restaurant_can_read/write` | Generic multi-tenancy; only the table prefix is domain-flavoured |
| Event infrastructure | `restaurant/events/**`, `domains/_platform/events/**` | Two implementations already exist — consolidate *into Core*, not into a third |
| Audit framework | `documents/audit/audit.server.ts`, `activity-log.server.ts` | Append-only journaling is universal |
| Configuration/product identity | `restaurant/core/product.ts` (from PRODUCTIZATION-1) | Already neutral |
| Runtime/deployment abstraction | *does not exist yet* | The adapter set defined in §I is Core by nature |
| AI orchestration | `src/lib/ai-gateway.server.ts`, `domains/_platform/ai/**` | Provider-agnostic already |
| Notification abstraction | `receipts/delivery.server.ts` provider gates | Correct pattern, wrong home |
| Document abstraction | `restaurant/documents/**` | Registry + builders + renderer are domain-agnostic |
| Integration contracts | `folio.contracts.ts` shape | The Hub's future base contract |

Extraction is deliberately deferred: moving these before the local runtime exists would churn 100+
imports for no operational gain.

---

## Q. Product boundary map (Phase 13)

| Boundary | Modules |
|---|---|
| **NOVA CORE** (future) | identity, capabilities, tenancy, events, audit, config, AI orchestration, notification + document abstractions, integration contracts |
| **NOVA HOSPITALITY OS** | `src/modules/restaurant/**` — menu, products, recipes/costing, inventory, procurement, purchasing, requisitions, suppliers, pricing, sales/POS, bar, kitchen, receipts, documents, reconciliation, masterdata, decisions, intelligence (advisory) |
| **NOVA LOCAL RUNTIME** | Node bundle host, local PostgreSQL, PostgREST-compatible layer, local auth issuer, local queue/scheduler, hardware/print service, backup agent, updater, LAN/TLS/discovery |
| **NOVA CLOUD SERVICES** | remote management, cloud backup, remote reporting, multi-property admin, AI services, notification relays, licensing, telemetry, update distribution |
| **NOVA INTEGRATION HUB** | PMS/folio, accounting, payment providers/terminals, KDS hardware, supplier EDI, external SSO |
| **CUSTOMER/PROPERTY CONFIG** | tenant records, currency, timezone, tax rules, printers/stations, branding, users/roles |
| **EXTERNAL PROVIDERS** | Twilio, email provider, Lovable AI Gateway, Pesapal, PMS vendors |
| *(Mtoni deployment, not product)* | bookings, guests, front desk, online check-in, CMS/journal, SEO, marketing site, WLHA campaign, Pesapal, `expire-booking-holds` |

**Ambiguous, flagged:**
1. `restaurant/intelligence/**` — in the OS boundary but depends on a cloud AI provider. Resolution:
   the *module* is OS; the *inference* is Cloud Optional. Must degrade, never block.
2. `restaurant/guest/guest-context.functions.ts` — reads the host guest directory. Currently an
   optional seam; must stay optional or move to the Hub.
3. `sales/roomcharge.server.ts` ↔ folio adapter — OS-side tender type, Hub-side transport.
4. Object storage — restaurant documents are generated client-side today, so the OS has no hard
   storage dependency; that will change the moment documents are archived server-side. Decide before
   PRODUCTIZATION-5.
5. The duplicated `email_infra` migrations and the `anon` EXECUTE re-grant (§E.6) — ownership unclear
   between platform and product.

---

## R. Productization risk register

| ID | Risk | Sev | Type | Mitigation |
|---|---|---|---|---|
| B1 | 391 `auth.uid()` sites; no local identity source | **High** | Blocker | `auth` compatibility shim reading `request.jwt.claims` GUC; zero policy rewrites |
| B2 | App speaks PostgREST; stock Postgres does not | **High** | Blocker | Ship PostgREST with NOVA Local; 0 app files change |
| B3 | JWT issuance/refresh depends on Supabase Auth | **High** | Blocker | Local issuer behind the existing middleware contract |
| R4 | `pgmq`/`pg_net`/`vault`/`pg_cron` in email infra | Medium | Recommendation | Table-backed queue behind the 4 existing wrapper functions; OS scheduler; drop unused `pg_net`/`vault` |
| R5 | Supabase Storage for docs/media (non-restaurant today) | Medium | Recommendation | Storage adapter before any server-side document archive |
| R6 | Realtime channels (notifications, arrivals) | Low | Recommendation | `LISTEN/NOTIFY` fan-out; React Query refetch already covers POS |
| R7 | Single-host NOVA Local = single point of failure | Medium | Accept v1 | Verified backups + documented spare-host restore; HA is Enterprise |
| R8 | Browser-only printing cannot drive kitchen printers/drawers | Medium | Recommendation | Hardware service (PRODUCTIZATION-7) |
| R9 | No local update path; silent data loss risk on upgrade | **High** | Blocker for GA | Mandatory verified pre-flight backup + abort-on-failure updater |
| R10 | `anon` re-granted EXECUTE on `has_any_role`/`is_any_staff` (`20260717175926:2,4`) | Medium | Security review | Confirm live grants; revoke if unintended. Not changed in this audit |
| R11 | Duplicate `email_infra` migrations | Low | Hygiene | Deduplicate during the local bootstrap work |
| R12 | Service-role client used for public receipt reads (`delivery.server.ts:423`) | Low | Recommendation | Keep token-scoped; replace with a narrow anon policy when the storage/identity adapter lands |
| R13 | No tenant/first-admin provisioning (carried from P-1) | **High** | Blocker | Installer setup flow in PRODUCTIZATION-3 |

---

## S. Recommended implementation sequence

The requested order is broadly right but **Backup must precede the Installer** — never ship an
installer that can upgrade a customer database before verified backup/restore exists. Revised:

1. **PRODUCTIZATION-3 — Local Runtime Foundation** (B1, B2, B3, R13) — the only sprint that unblocks everything.
2. **PRODUCTIZATION-4 — Backup & Restore** (was 5; promoted, R9 prerequisite).
3. **PRODUCTIZATION-5 — Installer & Update/Migration Model** (was 4 + 10, merged: an installer without an updater is a liability).
4. **PRODUCTIZATION-6 — Multi-terminal Networking** (LAN, TLS, discovery, terminal identity).
5. **PRODUCTIZATION-7 — Hardware & Printing Abstraction.**
6. **PRODUCTIZATION-8 — Local Queue/Scheduler & Notification Adapter** (new; retires R4 and makes offline email/WhatsApp queue-and-drain real).
7. **PRODUCTIZATION-9 — Licensing & Activation** (must work offline with grace periods).
8. **PRODUCTIZATION-10 — Cloud Services.**
9. **PRODUCTIZATION-11 — Integration Hub.**
10. **PRODUCTIZATION-12 — Commercial Packaging.**
11. **PRODUCTIZATION-13 — Production Certification.**

---

## T. PRODUCTIZATION-3 specification (Local Runtime Foundation)

**Goal:** the existing NOVA Hospitality OS bundle runs, unmodified, against a local PostgreSQL with
local identity — while the hosted deployment continues to work from the same source tree.

Scope:
1. **Identity compatibility layer** — bootstrap migration creating the local `auth` schema
   (`users`, `uid()`, `role()`) over `request.jwt.claims`, plus the `anon`/`authenticated`/
   `service_role` roles and the `extensions` schema. Additive; hosted deployment unaffected.
2. **Runtime profile abstraction** — a `NOVA_RUNTIME=cloud|local` switch selecting the auth provider
   and data-layer configuration behind the *existing* middleware contract
   (`{ supabase, userId, claims }`). No `src/modules/restaurant/**` file may change.
3. **Local auth issuer** — Argon2id password store, access + refresh tokens, terminal binding.
4. **Provisioning** — one-time localhost setup flow: create the tenant, create the first
   administrator, seed roles. Closes R13. No fake business data.
5. **Local stack composition** — PostgreSQL 16 + contrib, PostgREST, the Node bundle; documented,
   reproducible, scripted for Windows and Linux.
6. **Proof of equivalence** — the full 123-test restaurant suite plus an authenticated end-to-end POS
   smoke run (open → add lines → fire → bill → pay → print) against the local stack **with WAN
   disconnected**.

Explicitly out of scope: installer, backups, LAN networking, hardware, licensing, cloud services,
Integration Hub, and any change to transactional business logic.

Exit criteria: a full service cycle completes on a local machine with no Internet, RLS and capability
enforcement demonstrably unchanged, and the hosted deployment still green.

---

## U. Verification results

- **Typecheck** — `bunx tsgo --noEmit` → exit 0, no errors.
- **Tests** — `bunx vitest run src/modules/restaurant` → **11 files, 123/123 passed**, exit 0.
- **Production build** — not re-run: this sprint changed **zero** source files, so the previously
  certified build (PRODUCTIZATION-1 / final UAT freeze, 8 GB heap) remains valid. `git`-visible
  changes this sprint: this document only.
- **Restaurant/Bar regressions** — none possible; no application, schema, or migration file was
  modified. Confirmed by the unchanged test and typecheck results.
- **Transactional business logic** — untouched, as required by rules 3–7.

### Findings summary

- **Blockers (must be solved in PRODUCTIZATION-3):** B1 identity, B2 data layer, B3 auth issuance,
  R13 provisioning. R9 (safe updates) is a blocker for commercial GA, not for P-3.
- **Recommendations (non-blocking):** R4–R8, R10–R12.
- **Non-issues that were expected to be problems:** pgvector (absent), Edge Functions (none),
  in-database HTTP callouts (none live), server-side PDF rendering (none), payment gateway in the
  restaurant core (none), Mtoni hardcoding in restaurant runtime behaviour (none — cleared in
  PRODUCTIZATION-1).

## 🟡 READY FOR PRODUCTIZATION-3 WITH DOCUMENTED BLOCKERS

Stopping here as instructed. PRODUCTIZATION-3 is specified but not started.
