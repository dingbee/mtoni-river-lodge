# PRODUCTIZATION-1 — Standalone Restaurant & Bar OS

## A. Verdict
🟡 **STANDALONE PRODUCT READY WITH DOCUMENTED PRODUCTIZATION FOLLOW-UPS**

The core is tenant-independent in code, schema and runtime. It was not rewritten.
Only four product-independence defects existed; all are fixed. The remaining gap is
tenant *provisioning* (creating the first tenant + first administrator), which is a
platform/NOVA concern, not a Restaurant & Bar defect.

## B. Product boundary
Inside the product: master data (properties, outlets, locations, stations, tables,
categories, products, variants, modifiers, recipes, suppliers, inventory items,
units, batches); operations (restaurant POS, bar POS, kitchen, service, bills,
payments, receipts, delivery, tabs, requisitions); inventory ledger (receiving,
transfers, waste, stocktake, adjustments, reversals, production, consumption);
procurement (PR → approval → PO → GR → SI → three-way match → variance);
commercial (price lists, prices, promotions, taxes, service charges, rounding,
pricing trace); control (reconciliation, daily close, audit, documents,
permissions/capabilities); intelligence (facts/events into the existing
Intelligence Core, no second engine).

Outside: PMS, bookings, rooms, folios, guest CRM, check-in/out, accounting,
external KDS/hardware/reservation systems.

## C. Mtoni dependency map (all findings)
| # | Finding | Class | Action |
|---|---------|-------|--------|
| 1 | `receipts/delivery.server.ts` share links fell back to `https://mtoniriverlodge.com` | MTONI / P1 | **Fixed** — origin now resolves deployment config → live request host → relative |
| 2 | Decision constraint copy "Mtoni positions on quality…" | MTONI / P2 | **Fixed** — neutral wording |
| 3 | Team panel empty-state "only Mtoni platform administrators…" | MTONI / P2 | **Fixed** |
| 4 | Comments in `permissions.ts`, `members.server.ts`, `contracts.ts`, `decision.types.ts` | MTONI / P3 | **Fixed** — "host platform" |
| 5 | `TZS` / `Africa/Dar_es_Salaam` literals scattered as form/schema defaults | CONFIG | **Fixed** — centralised in `core/product.ts` (`DEFAULT_CURRENCY`, `DEFAULT_TIMEZONE`); runtime always prefers property config |
| 6 | `sales/roomcharge.server.ts` → `@/domains/hospitality/folio/*` | INTEGRATION | Kept, already an isolated adapter behind `sales.room_charge` capability and dynamic import; becomes an Integration Hub contract |
| 7 | `core/ui/TeamPanel.tsx` → `@/lib/staff.functions` (host user directory) | INTEGRATION / NOVA | Kept — user directory is a platform primitive; membership + roles are tenant-owned |
| 8 | `documents.test.ts` fixture uses "Mtoni River Lodge" | TEST | Harmless fixture data |

No hardcoded tenant/property/outlet/room/booking IDs, no Mtoni secrets, no Mtoni
seed data required for boot. `PUBLIC_APP_URL` is the only origin input.

## D. Configuration map
Tenant: name, slug, settings (business profile — legal/trading name, tax id,
address, phone, email, default currency, timezone), subscription plan/features.
Property: name, slug, timezone, currency, status. Outlet/location, station,
table, service period, price list, tax/service charge/rounding rule, approval
rule, negative-stock policy, document sequences and prefixes, receipt identity,
delivery providers. All editable through Restaurant Setup / Master Data
Workbench, Pricing Centre, Settings — no SQL.

## E. Integration map (future Integration Hub contracts)
guest identity · stay identity · room · folio/room charge · payment provider ·
messaging (email/WhatsApp) · accounting export · KDS · hardware · external
reservations. Today only the folio adapter is wired, and it is optional.

## F. NOVA Core candidates (audit only, nothing moved)
tenancy primitives, authentication, capability framework, audit/activity log,
event bus, idempotency utilities, document infrastructure (numbering, render,
export), configuration framework, user directory, notification providers.

## G. Tenant isolation evidence
```
restaurant_* tables: 79
RLS enabled:         79 / 79
tables with 0 policies: 0
tables without tenant_id: 1 (restaurant_tenants — the tenant root itself)
```
Every server module routes through `assertTenantRead` / `assertCapability` and
RLS re-enforces tenant scope in Postgres; cross-tenant reads and writes are
rejected at the database, not only in application code.

## H. New tenant readiness
A blank tenant can be configured end-to-end through the UI: property → business
profile (currency/timezone/tax identity) → outlets/locations → stations → tables
→ team & roles → suppliers → units/categories → inventory → products → recipes →
menus → price lists/prices → taxes/service charges/rounding → receipt identity →
delivery providers → opening stock → readiness check → operations. Screens render
setup states, not fake data. **Gap:** creating the tenant row itself and granting
the first administrator still requires platform-level action (P1, NOVA/platform).

## I. Fixes made
`core/product.ts` (new product identity + neutral defaults + origin resolver),
`receipts/delivery.server.ts`, `decisions/optionCatalogue.ts`,
`decisions/decision.types.ts`, `core/ui/TeamPanel.tsx`, `core/permissions.ts`,
`core/members.server.ts`, `core/contracts.ts`, `masterdata/contracts.ts`,
`masterdata/ui/panels/PropertiesPanel.tsx`, `masterdata/ui/panels/BusinessPanel.tsx`.

## J. Results
Typecheck: clean. Restaurant suite: **123/123 passed (11 files)**. No Mtoni
regression: branding, routes, POS/Bar POS, inventory, procurement, receipts,
documents, reconciliation and intelligence unchanged in behaviour.

## K. Remaining follow-ups
- **P1** Tenant provisioning + first-admin grant has no UI (platform/NOVA scope).
- **P2** Receipt/document branding pulls address/contact from tenant settings only; no logo upload.
- **P2** Commercial model: TENANT/PROPERTY/OUTLET/USER/ROLE/CAPABILITY/PLAN/FEATURE exist; USAGE metering does not. Billing intentionally not built.
- **P3** Currency formatting still uses `en-US` locale grouping in a few display helpers.
- **CONFIG** Each new tenant must enter its own master and commercial data.
- **INTEGRATION** Room charge / guest identity remain adapter-only.
- **MTONI** None outstanding.
- **NOVA** See F.

## L. Proposed architecture
```text
NOVA CORE (tenancy, auth, capabilities, audit, events, documents, config)
        ↓
RESTAURANT & BAR OS
        ↓
TENANT → PROPERTY → OUTLET

future:
NOVA CORE
        ↓
INTEGRATION HUB
   ↙        ↓         ↘
 MOS   Restaurant   External
        & Bar        systems
```
