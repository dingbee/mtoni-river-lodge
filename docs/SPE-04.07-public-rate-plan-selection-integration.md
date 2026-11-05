# SPE-04.07 — Public Rate-Plan Selection Integration

**Programme:** StayNas — Pricing & Revenue Management  
**Workstream:** SPE-04 — Deterministic Pricing Resolver  
**Milestone:** SPE-04.07  
**Priority:** P0 — Public booking correctness  
**Status:** IMPLEMENTATION COMPLETE · NOLMARK UAT REGRESSION PASS · RELEASE HOLD  
**Predecessor:** SPE-04.06 — Final Verification & Release Readiness  
**Repository:** `dingbee/mtoni-river-lodge`  
**Working branch:** `feat/spe-04-deterministic-pricing-resolver`

## 1. Outcome

SPE-04.07 closes the SPE-04.06 public-booking limitation. Eligible published plans can be discovered safely and a guest-selected `rate_plan_id` now flows through availability, quote and booking. The database resolver remains the only pricing authority and revalidates the selected plan at each pricing/booking boundary.

## 2. Implemented

### A. Guest-safe plan discovery
- Added `public.discover_staynas_public_rate_plans(...)` in `20261106210000_spe04_public_rate_plan_discovery.sql`.
- Discovery scopes by server-resolved property, active room, room catalogue assignment, occupancy, complete stay dates and latest immutable publication.
- Each candidate is checked by `resolve_staynas_published_room_pricing`; ineligible plans are excluded.
- Guest response is limited to plan ID, name, description, meal plan, refundable flag, currency, accommodation total, minimum stay and immutable publication evidence.
- Mutable `rate_plan_data`, internal policy JSON and administrative metadata are not returned.
- Direct RPC execution is restricted to `service_role`; the browser reaches it only through server-side booking functions.

### B. Selected-plan propagation
- Added selected-plan wrappers for shared availability, quote and booking contracts in `20261106220000_spe04_public_rate_plan_propagation.sql`.
- The shared pricing adapter reads a transaction-local selected-plan context. Quote and booking wrappers set that context locally, then invoke the existing shared path.
- Explicit plan IDs are revalidated by the authoritative resolver on every quote and booking call. Invalid, stale, cross-property, unassigned or out-of-period selections fail closed.
- Existing RPC signatures and single-plan/legacy behaviour remain intact.
- Booking persistence continues to store the quote snapshot; nightly evidence carries plan ID, publication ID/number, version and snapshot hash.

### C. Public server functions and guest UI
- `src/lib/booking.functions.ts` now supports optional `ratePlanId` in availability, quote and booking.
- When availability returns `RATE_PLAN_REQUIRED`, the server resolves guest-safe choices for that room.
- `src/routes/book.tsx` presents a selector only when multiple eligible plans exist. It displays plan name, meal plan, refundability and the property-currency accommodation total.
- Selecting a plan triggers a fresh authoritative quote; the selected ID is carried into booking submission and the booking summary.
- `src/routes/api/public/availability.search.ts` accepts optional `rate_plan_id` and returns plan choices for ambiguous rooms.
- `src/lib/public-booking.functions.ts` also carries optional plan IDs through the controlled public demo availability and booking contracts.
- No TypeScript monetary calculator was introduced.

## 3. CI evidence

All three required checks passed on implementation head `044c2d60097441f245683fb59c0d5384f72a1367`:

- [P1 build — PASS](https://github.com/dingbee/mtoni-river-lodge/actions/runs/42071735878)
- [P1 tests — PASS](https://github.com/dingbee/mtoni-river-lodge/actions/runs/42071735842)
- [Finance/payment integrity — PASS](https://github.com/dingbee/mtoni-river-lodge/actions/runs/42071735810)

The pgTAP test files contain eight discovery and eight selected-plan propagation assertions. The pgTAP runner itself was not executed because the current UAT project does not have the pgTAP extension. The CI workflows do not execute these SQL pgTAP suites.

## 4. Nolmark CDMA UAT

Applied only to the existing shared UAT Supabase project; no production migration or deployment:

1. `spe04_public_rate_plan_discovery`
2. `spe04_public_rate_plan_propagation`

Database regression passed:
- Two temporary plans assigned to the same Nolmark room type were discovered as two guest-safe options.
- An implicit quote with two eligible plans returned `RATE_PLAN_REQUIRED`.
- Explicit plan A and B produced the expected two-night accommodation totals: USD 200 and USD 260.
- Availability remained selectable while the plan choice was required.
- Explicit-plan availability returned the selected plan's matching quote.
- A booking was created inside a rollback-only subtransaction; its booking snapshot and both booking-night records were checked for selected plan/publication evidence. The deliberate rollback removed the booking and booking-night writes and restored inventory counts.
- An invalid selected plan returned `NO_ELIGIBLE_RATE_PLAN` before booking persistence.
- Legacy-only Nolmark quote and availability behaviour remained operational before the temporary published-plan test.

### UAT cleanup and residual state

The two temporary test plans were transitioned through the audited lifecycle RPC to **archived / inactive** after the regression. Their immutable publication snapshots and audit events remain by design; they are not eligible or exposed for booking. Nolmark has zero active published plans. The original SPE-03 fixture remains draft and unpublished. No SPE-04 test booking or booking-night rows remain. Mtoni has no SPE-04 test plans or publications and was not modified.

## 5. Acceptance status

- [x] Guest-safe discovery is property-, room-, occupancy- and stay-scoped.
- [x] Multiple eligible plans are returned; missing selector fails closed.
- [x] Explicit plan selection is propagated through availability, quote and booking.
- [x] Selected plans are revalidated server-side at quote and booking.
- [x] Booking and booking-night snapshots retain selected publication evidence.
- [x] Legacy-only pricing remains operational.
- [x] Invalid selected-plan denial and rollback/no-residue booking regression passed.
- [x] P1 build, P1 tests and Finance/payment integrity passed on the implementation head.
- [x] Nolmark UAT regression passed; temporary plans are archived and inactive.
- [ ] Authenticated browser UAT of the guest selector has not been run; no deployment was made.
- [ ] Historical-price invariance across a subsequent publication has not been separately exercised in this milestone.
- [ ] pgTAP runner execution remains unavailable in the current UAT project.

## 6. Release boundary

PR #151 remains draft and unmerged. No production migrations, deployment, merge, live rate changes, booking changes, invoice/payment changes, room/inventory changes, membership changes or tenant-configuration changes were made. Production release remains a separate authorization decision.

