# FINAL UAT — Restaurant & Bar Core: Production Verification & Freeze

## A. Executive verdict
🟢 **RESTAURANT & BAR CORE — PRODUCTION READY / FROZEN**
(subject to business data entry listed in section F — configuration, not defects)

## B. What was verified
- **Build gate**: typecheck (tsgo) clean; full test suite 150/150 across 13 files; production build succeeds (Cloudflare/nitro output, PWA precache generated).
- **Transaction & inventory integrity (UAT-1)**: idempotent ledger reversal, negative-stock policy on every outbound movement type, cancellation state machine — all covered by `inventory/integrity.test.ts`.
- **No direct balance mutation**: no code path writes `restaurant_inventory_items.current_quantity` directly; every change flows through the movement ledger / `restaurant_apply_stock_movement`.
- **Procurement governance (UAT-2)**: state machine ownership of PR→PO→GR→SI, SoD on approval, optimistic concurrency on status transitions, cancelled-PO resurrection blocked (`procurement/governance.test.ts`, `procurement/receiving-governance.test.ts`).
- **Documents (UAT-3A)**: requisition registered as a first-class document; registry/format/capability assertions in `documents/documents.test.ts`; HTML rendering escapes user data (XSS regression test present).
- **Access control**: all 31 restaurant `*.functions.ts` modules carry auth/capability guards (`requireSupabaseAuth` + `assertCapability`); none unguarded.
- **Discoverability**: 25/25 restaurant admin routes are reachable from the sidebar navigation — zero orphan screens.
- **Runtime smoke (authenticated, headless browser)**: Overview, POS, Bar POS, Procurement, Pricing, Requisitions, Documents, Reconciliation, Stock Movements, Tenant Settings all render with **zero console errors**.
- **Database linter**: 62 findings, all WARN, all the pre-existing `SECURITY DEFINER` execution-grant class. **No ERROR-level findings.**
- **Code hygiene**: no TODO/FIXME/"coming soon"/not-implemented markers in the restaurant module; no hardcoded colour utilities in restaurant UI (the only `bg-white` is the print-preview paper surface, which is intentional).

## C. What was fixed (P1 only)
1. **Build gate defect** — `src/routes/_authenticated.admin.ai.knowledge.test.tsx` matched the Vitest test glob and failed the run with "No test suite found". Moved to `_authenticated.admin.ai.knowledge.test/index.tsx`; the route path `/admin/ai/knowledge/test` is unchanged and the suite is now green.
2. **Typecheck defect** — 4 `TS18048` errors in `documents.test.ts` from an unnarrowed `documentType()` result. Added an explicit narrowing guard.

No other production defects were found; no new features were added.

## D. Test / build results
- `tsgo --noEmit`: 0 errors
- `vitest run`: 13 files / 150 tests passed
- `bun run build`: success (8 GB heap configured; no OOM)

## E. Remaining P2/P3 follow-ups
- P2: `SECURITY DEFINER` functions remain executable by `anon`/`authenticated` (62 WARN). Documented technical debt; each function performs its own authorisation. Recommended future sweep: revoke `EXECUTE` from roles that never call them.
- P3: restaurant module has no route-level component tests; coverage is at the domain/service layer.

## F. Known business data still required (blocks go-live use, not code)
- No published menus and no active `restaurant_prices` rows → Pricing Readiness reports 0 sellable items. Prices must be entered via Pricing Centre before trading.
- Suppliers, inventory items, locations, stations and staff role assignments (Tenant Settings → Team) must be populated per property.
- Opening stock balances to be posted via `opening_balance` movements before the first close.

## G. Final blocker register
Empty. No open P0 or P1.

## H. Integration Hub readiness
The core is frozen and safe to build on: pricing, ledger, procurement and document layers all expose governed server functions with capability checks, and the PMS folio adapter contract already exists (`src/domains/hospitality/folio`). Integration work can begin against these boundaries without further core changes.
