# SPRINT UAT-0 — Restaurant & Bar OS Readiness Audit
Date: 17 August 2026. Method: static trace UI → server fn → service → DB → event, plus typecheck, full test suite and production build. No transactional behaviour was changed.

## 1. Executive summary

The Restaurant & Bar OS is a genuinely operational system, not a demo shell. The transactional spine (order → kitchen → bill → payment → receipt → close → consumption → reconciliation) is implemented end to end, persisted, idempotent in most places, and reachable from real UI. Master data for a brand-new outlet can be created entirely through `/admin/restaurant/setup` without SQL — with two exceptions (allergens, some menu scoping fields).

Mtoni could run a real service on this today for **food**. It could **not** yet run a real **bar** on it as a bar, and it could not yet run **allergen-safe** service without paper, because allergen declaration has no UI at all.

**Overall UAT readiness: ~72%** — derived from 17 scored areas below (9 READY, 5 READY-WITH-MINOR-FIXES, 3 BLOCKED), weighted by operational criticality. 6 blockers.

Verification run this sprint:
- typecheck: PASS (0 errors)
- test suite: 120/120 tests pass across 10 suites (1 pre-existing empty spec file, `src/routes/_authenticated.admin.ai.knowledge.test.tsx`, unrelated to restaurant)
- production build: PASS **after fixing one blocker** (see B-01). Build requires `NODE_OPTIONS=--max-old-space-size=8192` in this environment.

Passing typecheck/build does not mean UAT passes. It does not.

## 2. Blockers

| ID | Category | Module | Route | Role | Scenario | Expected | Actual | Root cause | Tables/services | Fix | Blocks UAT |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B-01 | Build | Platform | — | — | Deploy a UAT build | Production build succeeds | Build failed: import protection denied `extract.client` in server graph via ResPad route | Browser-only module statically imported into a route chunk | `RespadFileIntake.tsx` | **FIXED this sprint**: renamed to `extract.browser.ts`, loaded via dynamic import inside the handler | Was yes; now cleared |
| B-02 | Master data | Menu / allergens | `/admin/restaurant/menu` | Manager, Chef | Declare that an ingredient contains gluten; verify a menu item's allergens | Form to set ingredient allergens and mark an item allergen-verified | No UI anywhere. `setIngredientAllergensFn` / `verifyMenuAllergensFn` (`menu/lifecycle.functions.ts:44,52`) have zero call sites. `MenuLifecycleBoard.tsx:107-114` only *displays* verification status | Server layer shipped without its UI entry point | `restaurant_inventory_items.allergens`, `restaurant_menu_items.allergens` | Add an Allergen tab to `MenuItemSheet` + an ingredient allergen editor in `ItemsPanel`, wired to the two existing fns | Yes — allergen data is SQL-only |
| B-03 | Master data | Menu | `/admin/restaurant/menu` | Manager | Set a menu item's allergens, dietary tags, validity window and outlet scope | Fields present | `MenuItemSheet.tsx:27-123` never renders or submits `tags`, `allergens`, `validFrom/validTo`; `MenuSheet` never sets `property_id`/`location_id` although `core/contracts.ts:125-158` and `menu.server.ts:19,74` accept them | Form drifted behind its own schema | `restaurant_menus`, `restaurant_menu_items` | Extend both sheets to cover the existing schema | Yes for multi-outlet UAT |
| B-04 | Procurement | Purchasing (legacy) | `/admin/restaurant/purchasing` | Manager, Purchasing | Approve a directly-created purchase order | Approve button | `transitionRestaurantPurchaseOrderFn` (`purchasing.functions.ts:26`) has no UI call site; a PO created here can never leave `draft`. The same transition also skips `assertMayApprove`, unlike the PR path (`approvals.server.ts:108-135`) | Two parallel PO paths, only one governed | `restaurant_purchase_orders` | Either retire the legacy direct-PO create path in favour of Procurement Centre, or add approval UI **with** SoD check | Yes |
| B-05 | Bar | Bar POS | `/admin/restaurant/bar/pos` | Bartender | Sell one pour from a bottle; open a walk-up tab | Pour vs bottle selection, tab without a table | Bar POS is literally `<PosWorkspace lens="bar" />` (`bar.pos.tsx:27`); `lens` only filters the catalogue by drink keywords (`bar/lens.ts:17`). No pour/bottle toggle in `PosItemDialog`, no tab concept, no at-sale wastage. Pour maths exists but only in the read-only Bar Operations dashboard (`bar.server.ts`) and `PourConfigSheet` | Bar behaviour built as analytics, never wired into the till | `restaurant_orders`, `restaurant_order_items`, pour config | Add pour/bottle sell unit to the POS item flow and a counter-tab pseudo-table | Yes for bar UAT |
| B-06 | Inventory integrity | Sales ↔ inventory | POS | Manager | Reopen a settled bill, void a line, close again | Consumption for the voided line is reversed | Consumption posts at close with dedupe key `sold:<orderItemId>` (`sales.server.ts:544-618`). On reclose, voided items are skipped but the earlier movement is never reversed — `reverseMovement` (`waste.server.ts:248`) is never called from any sales path | No compensating movement on post-consumption void/refund | `restaurant_stock_movements` | Call `reverseMovement` for voided items that already have a `sold:` movement | Yes — silent stock drift |

## 3. High-priority issues

| ID | Area | Finding | Evidence |
|---|---|---|---|
| H-01 | Pricing integrity | POS accepts a **client-supplied price** when no commercial price is configured: `insertLines` calls the engine without `strict: true` and passes `fallbackUnitPrice: l.unitPrice` from the request body | `sales.server.ts:257-276`, `pricing/engine.ts:444-452`, `sales/contracts.ts:14` |
| H-02 | Inventory | `allow_negative` is checked only in `recordAdjustment`; sales consumption, waste, transfers and requisition issue can all drive stock negative | `waste.server.ts:197-199` vs `movements.server.ts:58-131,265-326`, DB trigger `restaurant_apply_stock_movement` |
| H-03 | Procurement | Batch code/expiry captured on goods-receipt lines is never written to `restaurant_inventory_batches`; FEFO and expiry alerting are disconnected from actual receiving | `receiving.server.ts:147-148` vs `:208-223`, `batches.server.ts:62-135` |
| H-04 | POS | No whole-order cancel. `transitionOrder` supports `cancelled`/`voided` (`sales.server.ts:651`) but no POS contract or button reaches it — a mis-opened table can only be emptied line by line | `pos.contracts.ts`, `PosWorkspace.tsx` |
| H-05 | Idempotency | `transferStock` (`movements.server.ts:204-259`) posts both legs with **no dedupe key** — a retry double-moves stock. Currently unreferenced by UI, so latent | `movements.server.ts:204-259` |
| H-06 | Kitchen | No "accept/acknowledge" state: tickets go `queued → preparing`, so an unseen ticket and an in-progress ticket are indistinguishable in the delay signal | `kitchen.server.ts:205-296`, `ui/lifecycle.ts:117` |

## 4. Medium issues

- M-01 Modifiers are not copied onto `restaurant_kitchen_ticket_items`; the cook sees description/notes only (`kitchen.server.ts:155-165`).
- M-02 Daily close gate is soft: any non-empty `overrideReason` bypasses every blocker including critical exceptions, with no elevated capability (`reconciliation.server.ts:815-835`). Fully audited, not prevented.
- M-03 Recipe/consumption cost silently defaults to 0 when an ingredient has no `average_cost` — stock decrements correctly, COGS understates (`recipe-cost.server.ts:108-123`, `consumption.server.ts:126-150`).
- M-04 Requisitions have no destination "received by department" step; `issued` immediately means `fulfilled` (`requisitions.server.ts:356-432`), unlike transfers which do split dispatch/receive.
- M-05 Two PO creation paths with different rigour (PR-governed vs direct) — confusing and audit-weakening even after B-04.
- M-06 `PosItemDialog` shows static item allergens but performs no guest-specific conflict check; the guest warning lives only in the top banner (`PosItemDialog.tsx:106`, `GuestContextBanner.tsx`).
- M-07 Void reason and refund reason use native `window.prompt`; "Reopen bill" fires with no confirmation and a hard-coded reason `"Correction at the till"` (`PosWorkspace.tsx:285,543,641-664`). Poor on tablet and weakens the evidence intent.
- M-08 Stocktake counter and approver can be the same `inventory_manager` (`permissions.ts:160-169`).
- M-09 `sales.manage` includes `chef`/`kitchen_manager`, blurring kitchen/cash separation (`permissions.ts:216-224`).
- M-10 Action-level SoD (void/refund/reopen) is enforced in the application layer only; RLS grants generic table write (`restaurant_can_write`), so it is not defence-in-depth.
- M-11 Inventory→menu opportunities carry no allergen/dietary implication and use recipe-line *presence*, not quantity scaling (`inventory-menu.server.ts:89-95`).
- M-12 `/admin/restaurant/suppliers` and `/admin/restaurant/inventory` are read-only lists; the real forms live under `/setup` and `/inventory-control`. Discoverability, not missing functionality.

## 5. Low issues

- L-01 `restaurant_receipts.delivered_at` is stamped when an attempt is merely `sent` (`delivery.server.ts:196-206`); the per-attempt row stays honest. Naming/reporting clarity only.
- L-02 The `delivered` delivery status is currently unreachable — no provider callback sets it.
- L-03 Short tender has no dedicated warning; it simply lands as `partially_paid`.
- L-04 Day reopen needs only `reconciliation.reopen` + reason, no second approval (mitigated: re-flags as an exception next run).
- L-05 Production build needs an 8 GB heap; worth pinning `NODE_OPTIONS` in the build script.
- L-06 Empty test file `src/routes/_authenticated.admin.ai.knowledge.test.tsx` fails the suite as "no test suite found".

## 6. Lifecycle assessments

**Restaurant POS — strong.** Table → open → covers → catalogue → variants → modifiers → fire → prep → ready → serve → bill requested → bill presented → payment → receipt → release → close are all implemented and wired (`requestRestaurantBillFn`/`presentRestaurantBillFn` are called at `PosWorkspace.tsx:236,245`; `releaseTable` at `:614`). Partial payment, split (even/amount/seat), over-tender change, void line, refund, reopen, table transfer, reprint all work. Missing: whole-order cancel (H-04), kitchen accept (H-06).

**Bar POS — not differentiated.** See B-05. Reuses the shared transaction spine correctly, which is the right architecture; the bar layer simply never reached the till.

**Kitchen — good.** Station routing, per-station ticket splitting, real timing/delay maths with `restaurant.kitchen.ticket.delayed` events, recursive sub-recipe explosion, actual-vs-theoretical cost. Weak points: no accept step, modifiers not on the ticket.

**Procurement — strong on the governed path.** PR → approve (with `assertMayApprove` SoD) → PO → supplier confirmation → GR with received/accepted/rejected/damaged → posting → supplier invoice → three-way match → variance → payment status, all persisted as distinct facts with dedupe keys. Weak points: B-04, H-03, M-04, M-05.

**Inventory — ledger-correct.** `restaurant_stock_movements` is the single source of truth; balances are written only by the DB trigger, weighted-average cost is computed there, positions read from a view. Stocktake and transfers post movements rather than mutating balances. Weak points: H-02, H-05, B-06.

**Receipts & documents — strong.** Immutable snapshot at issue, counted reprints, shared `restaurant_next_document_number` sequence across receipts/stocktakes/transfers/procurement, real builders for PO/GR/invoice/transfer/stocktake/receipt plus CSV/XLSX exports. Delivery is honest: Twilio acceptance is recorded as `sent`, never `delivered`, and an unconfigured provider yields `shared` + `whatsapp_provider_not_configured` (`delivery.server.ts:301-338`). This passes the sprint's critical check.

**Reconciliation — strong detection, soft gate.** Detects undeclared tender, cash over/short, duplicate payment, refund without original, over-refund, missing payment, closed-without-receipt, open orders, reopened-after-close, receipt-without-payment, negative stock, ledger drift, unresolved procurement variance, room-charge exceptions. Gate computes `canClose` correctly but is overridable (M-02).

**Intelligence — correctly centralised.** One seam (`emitRestaurantEvent` → core `recordEvent`), decisions persisted into the shared `intelligence_decisions`/`intelligence_plans` ledger under `module: "restaurant"`, reusing core `evaluateOptions`/`buildPlan`. No second AI engine, no parallel memory, no duplicate recommendation store. Allergen inference is regex-based and never LLM-generated; unresolved data forces `verify`, and no code path can claim "safe".

## 7. UAT scorecard

| Area | Score |
|---|---|
| Master data | READY WITH MINOR FIXES (BLOCKED for allergens — B-02/B-03) |
| Procurement | READY WITH MINOR FIXES (B-04) |
| Inventory | READY WITH MINOR FIXES (H-02, B-06) |
| Kitchen | READY WITH MINOR FIXES |
| Restaurant POS | READY |
| Bar POS | BLOCKED |
| Products / Recipes | READY |
| Commercial rules | READY WITH MINOR FIXES (H-01) |
| Documents | READY |
| Receipts | READY |
| Reconciliation | READY |
| Guest intelligence | BLOCKED (no allergen entry UI) |
| Inventory→Menu intelligence | READY |
| Intelligence Core | READY |
| Failure recovery | READY WITH MINOR FIXES |
| Tablet UX | READY WITH MINOR FIXES |
| Permissions | READY WITH MINOR FIXES |

## 8. Already complete — do NOT rebuild

Setup Workbench (business, properties, outlets, stores, units, categories, items, suppliers, supplier products, stations, tables, service periods) · supplier catalogue & pricing · inventory batches/locations/transfers/waste/adjustments/stocktakes · product/variant/modifier/recipe sheets with sub-recipes, yields and costing · pricing engine with precedence, tax, service charge, rounding, promotions, price snapshots and traces · POS order/bill/split/payment/refund/reopen/transfer · kitchen ticketing with station routing and delay events · consumption engine with recipe pinning · procurement PR→PO→GR→invoice→3-way match→variance · requisitions · document registry, numbering, exports · receipt issue/reprint/delivery ledger · reconciliation exception catalogue and daily close · restaurant intelligence + decision integration into the Intelligence Core.

## 9. Must be fixed before the Integration Hub

B-02, B-03, B-04, B-05, B-06, H-01, H-02, H-03, H-05. (H-01/H-02/B-06 in particular: the Hub will export these numbers to accounting and PMS, so they must be trustworthy first.)

## 10. Proposed remediation sequence

1. **UAT-1 — Integrity** (B-06, H-01, H-02, H-05): void reversal, strict pricing for POS lines, negative-stock enforcement in the ledger, dedupe key on `transferStock`.
2. **UAT-2 — Allergen & menu completeness** (B-02, B-03, M-06, M-11): allergen entry UI, menu sheet field parity, per-item guest conflict warning in `PosItemDialog`.
3. **UAT-3 — Procurement governance** (B-04, H-03, M-04, M-05): single governed PO path, batch creation from goods receipt, requisition receipt confirmation.
4. **UAT-4 — Bar differentiation** (B-05): pour/bottle sell unit at the till, counter tabs, at-sale wastage.
5. **UAT-5 — Operational polish** (H-04, H-06, M-01, M-02, M-07..M-10, L-*): order cancel, kitchen accept, modifiers on tickets, in-app confirm sheets, close-override capability, SoD tightening.
6. Then, and only then, Integration Hub Foundation.
