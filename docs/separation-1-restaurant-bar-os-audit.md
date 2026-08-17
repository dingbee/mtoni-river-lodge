# Separation Audit — Restaurant & Bar OS out of `dingbee/mtoni-river-lodge`

Status: **AUDIT ONLY — no code, schema, config or repository changed.**
Verdict: **🟡 SEPARABLE WITH A THIN HOSPITALITY BRIDGE** — the module is already
99% self-contained; four seams must be abstracted before extraction.

---

## 1. Where the Restaurant & Bar OS lives today

| Layer | Location | Size |
| --- | --- | --- |
| Domain code | `src/modules/restaurant/**` | ~200 files, 25 sub-domains |
| Routes | `src/routes/_authenticated.admin.restaurant.*.tsx` | 27 files |
| Module registry | `src/domains/_platform/registry/modules/restaurant.module.ts` | 1 file |
| Public receipt route | `src/routes/receipt.$token.tsx` | shared surface |
| Local runtime | `local/**` (gateway, installer, SQL shims, scripts) | already product-shaped |
| DB schema | 79 `restaurant_*` tables inside `supabase/migrations` (21 of 102 files touch them) | mixed with Mtoni |
| DB functions | `restaurant_can_read`, `restaurant_can_write`, `restaurant_is_platform_admin`, `restaurant_apply_stock_movement`, `restaurant_next_document_number` | 5 |
| Edge functions | **none** — all server logic is `createServerFn` / `*.server.ts` | 0 |
| Storage buckets | **none referenced by the module** | 0 |
| Seed/demo data | **none** — no restaurant seed exists yet | 0 |

Sub-domains present (all requested capabilities are covered):
core/tenancy, masterdata (business, outlets, stores, units, categories, tables,
stations, service periods), menu + lifecycle + allergens, products/variants/
modifiers/bundles, recipes + composition + production, costing + profitability,
inventory (batches, locations, positions, reservations, stocktake, transfers,
waste, reversals, policy), suppliers, purchasing + state machine, procurement
(requests, approvals, confirmations, receiving, variances, invoices, audit),
requisitions, sales/POS (orders, tables, payments, splits), bar (pour, lens,
POS), kitchen/KDS, pricing engine (taxes, service charge, discounts,
promotions, rounding, FX), reconciliation + daily close + tender declarations,
receipts + delivery, documents/exports, intelligence, decisions.

## 2. Isolation map

### 2a. Restaurant & Bar OS — moves to the new product
All of `src/modules/restaurant/**`, all 27 restaurant routes, the restaurant
module registry entry, `receipt.$token.tsx`, all 79 `restaurant_*` tables and
the 5 `restaurant_*` DB functions, and the whole `local/**` runtime.

### 2b. Mtoni-only — must NOT move
`rooms`, `bookings`, `guests`, `booking_*`, `room_*`, `arrival_*`,
`guest_checkins`, `pms_folio_postings`, `pricing_rules`, `extras`,
`reviews`, `cms_*`, `journal_*`, `media_*`, `seo_*`, `respad_*`,
`ai_concierge_*`, marketing/campaigns, all site components
(`src/components/site/**`), Mtoni assets and branding, `.env`, `wrangler.jsonc`,
Pesapal settings, and the hosted Supabase project.

### 2c. Shared infrastructure

| Shared item | Used how | Safe to abstract? |
| --- | --- | --- |
| `@/components/ui/*` (shadcn) | pure presentational | ✅ copy — no Mtoni logic |
| `@/components/os/*` (SectionCard, StatusChip, PageHeader, StatCard, EmptyState, LoadingState) | admin shell kit | ✅ copy — generic |
| `@/hooks/use-admin-mutation` | 32 call sites | ✅ copy — generic wrapper |
| `@/integrations/supabase/auth-middleware`, `client`, `client.server`, `auth-attacher` | 31 call sites | ✅ regenerate against the new backend |
| `@/lib/utils` | `cn()` | ✅ copy |
| `@/domains/_platform/registry` | module registry | ✅ copy (registry itself is generic) |
| `@/modules/intelligence/**` (decision types, registry, planning/option/rules engines) | 7 imports from decisions + intelligence provider | ⚠️ **extract as a small shared kernel** or vendor a trimmed copy; it is hotel-agnostic but currently lives in Mtoni |
| `@/domains/hospitality/folio/*` (`folio.rules`, `folioAdapter.server`) | room-charge tender | ⚠️ **replace with a `PmsFolioPort` interface**; ship a no-op adapter in the standalone product |
| `@/lib/staff.functions` | 1 call site (staff picker) | ⚠️ replace with tenant `restaurant_members` lookup |
| `guest_preferences`, `bookings`, `guests` tables | guest dietary/allergen context | ⚠️ **replace with a `GuestProfilePort`**; standalone product stores diner context in its own table |
| `auth.users` | 67 FKs | ✅ present in the local runtime auth shim already |

### 2d. Mtoni dependencies that must be removed from the extracted product

1. `restaurant_orders.booking_id → public.bookings` (FK).
2. `restaurant_payments.booking_id → public.bookings` (FK).
3. `src/modules/restaurant/sales/roomcharge.{server,contracts}.ts` +
   `PosRoomChargeDialog.tsx` — hotel folio tender.
4. `src/modules/restaurant/guest/**` reads of `bookings` / `guests` /
   `guest_preferences`.
5. `pms_folio_postings` reads in reconciliation.
6. `intelligence_decisions` / `intelligence_plans` / `intelligence_plan_steps`
   writes from `decisions/`.
7. Mtoni branding in the shell, favicon, manifests and the site routes.

Everything else — the entire inventory, procurement, pricing, POS, KDS,
costing and reconciliation core — is already tenant-scoped by
`restaurant_tenants` / `restaurant_members` with its own RLS predicates
(`restaurant_can_read/write`) and does **not** touch hotel data.

## 3. Recommended extraction architecture

Two nullable ports replace all hotel coupling:

```text
Restaurant & Bar OS (standalone)
  core/ports/pms-folio.port.ts     ->  NoopFolioAdapter        (standalone)
  core/ports/guest-profile.port.ts ->  LocalDinerProfileStore  (standalone)
                                   ->  MtoniFolioAdapter       (inside Mtoni)
                                   ->  MtoniGuestAdapter       (inside Mtoni)
```

- Room charge becomes a *tender plugin*: absent adapter → the tender is hidden.
- `booking_id` columns become a generic nullable `external_ref` + `external_system`
  pair (no FK) in the standalone schema; Mtoni keeps its FK version.
- The intelligence kernel becomes `packages/intelligence-kernel` (or is vendored),
  with `intelligence_*` tables optional and feature-flagged.
- Mtoni continues to consume the module *unchanged* by supplying the real adapters.

## 4. Recommended repository structure

Proposed name: **`dingbee/nova-hospitality-fnb`** (product already branded NOVA
Hospitality in `local/`). Do not create it without approval.

```text
nova-hospitality-fnb/
  apps/web/                 TanStack Start app (admin shell + 27 routes + receipt route)
  packages/fnb-core/        the extracted src/modules/restaurant/**
  packages/ui/              shadcn ui + os shell kit
  packages/intelligence/    trimmed decision kernel (optional)
  db/migrations/            restaurant-only SQL, renumbered from 0001
  db/seed/demo/             "Demo Restaurant & Bar" synthetic data
  local/                    existing gateway + installer, unchanged
  docker/                   docker-compose.yml (postgres, postgrest, gateway)
  .env.example
```

Safest git strategy (no repo disconnection):
1. Keep `dingbee/mtoni-river-lodge` as-is and connected. Nothing is deleted there.
2. Create the new repo **empty** (after approval) and land the extraction as an
   additive first commit — a *port*, not a fork of Mtoni history.
3. Mtoni later consumes `@nova/fnb-core` as a dependency, or keeps its in-tree
   copy until parity is proven. No cut-over until the standalone product boots.
4. Rollback = delete the new repo; Mtoni is never modified.

## 5. Local environment architecture

```text
WSL2 / Ubuntu 22.04
  docker compose
    postgres:17        -> port 55432 (NOT 5432, avoids Mtoni/host clashes)
    postgrest          -> port 53000
    nova-gateway (bun) -> https://<lan-ip>:8443  (local/gateway/server.ts)
  storage: local filesystem volume ./.nova/storage  (no Supabase Storage)
```

Required environment variables (all local, none from Mtoni):

```text
NOVA_DB_HOST=127.0.0.1
NOVA_DB_PORT=55432
NOVA_DB_NAME=nova_fnb
NOVA_DB_USER=nova
NOVA_DB_PASSWORD=<generated>
NOVA_JWT_PRIVATE_KEY_FILE / NOVA_JWT_PUBLIC_KEY_FILE   (ES256, gen-keys.sh)
NOVA_KEY_DIR / NOVA_RUN_DIR / NOVA_BACKUP_DIR          (outside the source tree)
NOVA_TLS_IPS=<lan-ip>
NOVA_HTTPS_PORT=8443
NOVA_DEMO_SEED=true
VITE_SUPABASE_URL=http://127.0.0.1:53000     (local PostgREST sentinel)
VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key>
```

Hard rule: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_*` from the
repo `.env` must never enter the local runtime. `build-ui.sh` already shadows
`.env`, `start.sh` already strips hosted vars and runs `bun --env-file=/dev/null`,
and `verify-bundle.sh` already scans for hosted origins — that machinery is reused
verbatim.

### Database initialisation strategy
1. `local/sql/pre/*` — roles, extensions, `auth` shim, Supabase compat.
2. Restaurant-only migrations, renumbered — extracted by filtering the 21
   migration files that touch `restaurant_*`, minus the two hotel FK columns.
   No Mtoni migration is ever run in the standalone DB.
3. `local/sql/post/10-nova-local.sql` — local grants and PostgREST config.
4. Optional demo seed.

### Seed/demo data strategy
One synthetic tenant, entirely fictional:
`Demo Restaurant & Bar` → 1 property, 2 outlets (Restaurant, Bar), 3 stores,
12 tables in 2 dining areas, 2 kitchen stations, ~10 units, ~8 categories,
~60 products, ~15 recipes, ~40 ingredients, 4 suppliers with price lists,
1 open PO, 1 received GRN, seeded stock positions, a menu with prices, tax and
service-charge rules, and one demo user per role. No Mtoni row, name, guest,
booking, rate or asset is copied.

### Target startup experience
```text
git clone <new repo> && cd nova-hospitality-fnb
cp .env.example .env        # generates nothing hosted
./nova up                   # docker compose up -d && migrate && seed && start gateway
# -> https://localhost:8443  (Demo Restaurant & Bar)
./nova down | ./nova reset | ./nova logs | ./nova backup
```
`./nova up` is a thin wrapper over the existing `local/scripts/{preflight,init-db,
apply-migrations,build-ui,install,start}.sh`, so nothing is rewritten.

## 6. Safety verification (performed, read-only)

- ✅ No file was modified in this audit; Mtoni production is untouched.
- ✅ No production credential read, copied or echoed.
- ✅ No migration authored or executed; no hosted Supabase change.
- ✅ No Mtoni deployment config (`wrangler.jsonc`, `.env`, `supabase/config.toml`) touched.
- ✅ No Mtoni functionality removed; the module stays in place until cut-over.
- ✅ Existing installer guards (`verify-bundle.sh`, `.env` shadowing, port
  preflight incl. 8443) already prevent hosted-origin leakage into a local build.

## 7. Risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Restaurant migrations are interleaved with Mtoni migrations in 21 files | High | Author a fresh consolidated `0001_fnb_core.sql` from the live schema rather than cherry-picking history |
| R2 | Two hard FKs to `public.bookings` | Medium | Replace with nullable `external_ref` in the standalone schema |
| R3 | Intelligence kernel coupling | Medium | Feature-flag; ship the product without decisions in v1 |
| R4 | Divergence between the Mtoni copy and the product | High | Single source of truth via package dependency; freeze in-tree edits after cut-over |
| R5 | Port 5432 / 8443 clashes on the dev machine | Low | Use 55432/53000; preflight already checks 8443 |
| R6 | Mtoni branding left in the extracted bundle | Low | Re-brand shell, manifests, favicons in extraction step 4 |
| R7 | Guest dietary/allergen safety features degrade without a PMS | Medium | Local diner-profile store keeps allergen warnings intact |

## 8. Separation steps (proposed, not executed)

1. Approve the repo name and structure.
2. In Mtoni (non-breaking, additive): introduce `PmsFolioPort` and
   `GuestProfilePort`; move `folioAdapter`/guest reads behind them. Mtoni behaviour
   unchanged.
3. Snapshot the live restaurant schema → consolidated `db/migrations/0001_fnb_core.sql`
   with the two hotel FKs replaced.
4. Port `src/modules/restaurant/**` + routes + shared UI kit into the new repo.
5. Add docker-compose, `./nova` CLI, `.env.example`, demo seed.
6. Boot locally, run the existing 173-test suite plus a POS→KDS→payment→
   reconciliation smoke pass.
7. Only then decide whether Mtoni consumes the package or keeps its copy.

## 9. Rollback strategy

Steps 3–7 happen entirely in the new repository; rollback is deleting it.
Step 2 is the only Mtoni change: it is additive interface extraction on two
files, revertable by a single revert commit, and is gated behind the existing
regression suite before merge. No data migration, no destructive SQL, no
deployment change at any point.
