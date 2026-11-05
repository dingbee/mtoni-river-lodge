# SPE-04.07 — Public Rate-Plan Selection Integration

**Programme:** StayNas — Pricing & Revenue Management  
**Workstream:** SPE-04 — Deterministic Pricing Resolver  
**Milestone:** SPE-04.07  
**Priority:** P0 — Public booking correctness  
**Status:** IN PROGRESS — discovery RPC implemented on feature branch; end-to-end selector propagation pending  
**Predecessor:** SPE-04.06 — Final Verification & Release Readiness  
**Repository:** `dingbee/mtoni-river-lodge`  
**Working branch:** `feat/spe-04-deterministic-pricing-resolver`

## 1. Purpose

Close the SPE-04.06 release limitation: public booking contracts currently do not carry an explicit `rate_plan_id` end-to-end. The resolver correctly rejects ambiguous plan selection with `RATE_PLAN_REQUIRED`; this milestone exposes a safe, property-scoped guest selection path so multiple eligible published plans can be offered without weakening the resolver's fail-closed behaviour.

## 2. Scope

### A. Public eligible-plan discovery
- Add a server-side, property-scoped discovery contract for rate plans eligible for the requested room, stay dates and occupancy.
- Return only guest-safe fields required to distinguish plans (stable plan ID, display name/label, currency, pricing basis and any approved guest-facing description/terms).
- Eligibility must use the same active state, room-type assignment, plan effective dates and latest immutable publication snapshot rules as the pricing resolver.
- Never expose draft plans, unpublished snapshots, internal notes, commercial administration metadata or another property's plans.
- Do not trust a property ID supplied by the browser; resolve property context server-side from the existing booking-property configuration / public property allowlist.

### B. End-to-end selected plan contract
- Add optional `rate_plan_id` to public availability, quote and booking request schemas and pass it through to the database pricing path.
- Availability results and quote responses must include selected plan ID plus publication/version/hash evidence.
- Revalidate selected plan eligibility on every quote and booking call. Never trust a plan merely because it appeared in a previous availability response.
- A booking must persist the exact resolved plan/publication snapshot and nightly evidence; later publication changes must not reprice historical bookings.
- When one eligible plan exists, retain deterministic implicit selection for backwards compatibility.
- When multiple plans exist and no plan is selected, return `RATE_PLAN_REQUIRED` plus safe selectable choices where the API contract permits. Do not silently pick the cheapest or first plan.
- Invalid, stale, cross-property, unassigned or out-of-date selected plan IDs must fail closed with structured errors.

### C. Guest booking journey
- Add plan selection to the room/offer selection stage only when more than one eligible plan exists.
- Display clear guest-facing plan names, inclusions/terms and total price in the property currency.
- Recalculate the quote when the guest changes plan; clear stale quotes/holds when the selected plan changes.
- Carry the selected plan through guest details and final booking submission.
- Preserve the existing journey for single-plan and legacy-only properties.

### D. Public API and compatibility
- Update `/api/public/availability/search` and existing server functions without breaking current single-plan clients.
- Define explicit behaviour for external clients that omit a plan selector.
- Ensure all entry points share the same resolver and no old RPC overload bypasses the selected plan.
- Do not introduce a second pricing calculator in TypeScript.

## 3. SPE-04.07.01 — discovery contract implementation\n\nAdded `public.discover_staynas_public_rate_plans(...)` in migration `20261106210000_spe04_public_rate_plan_discovery.sql`. It resolves the room under the supplied property, enumerates only active/published plans assigned to that room catalogue type, constrains plan and latest-publication effective dates to the full stay, and calls the authoritative resolver for each candidate. It returns only guest-safe fields (plan ID/name/description/meal plan/refundable/currency/total/minimum stay and immutable publication evidence). It does not return mutable `rate_plan_data`, internal policy JSON or administrative metadata. Direct execution is revoked from PUBLIC/anon/authenticated and granted to `service_role`; the existing server-side property resolver remains the only intended public entry point.\n\nAdded eight pgTAP contract assertions in `supabase/tests/spe04_public_rate_plan_discovery.test.sql`. These are authored tests, not yet executed; pgTAP is unavailable in the current UAT project.\n\n## 4. Required verification

1. Single eligible plan selected implicitly; existing clients remain compatible.
2. Multiple eligible plans returned as safe options; missing selector fails closed.
3. Each valid explicit plan produces the matching quote and nightly evidence.
4. Stale publication, inactive/unpublished plan, unassigned room type, out-of-period plan and cross-property plan are rejected.
5. Availability, quote and booking use the same selected plan.
6. A changed plan invalidates any prior quote/hold binding where required.
7. Booking persists plan ID, publication ID/number, version, snapshot hash and per-night source evidence.
8. Historical booking snapshot remains unchanged after a later plan publication.
9. Legacy-only property path remains unchanged.
10. No price/rate or room availability mutation during discovery or quote.
11. All current P1 build, P1 tests and Finance/payment integrity CI pass on the exact milestone head.
12. Nolmark CDMA UAT tenant regression passes; Mtoni tenant and production remain untouched.

## 5. Security and data boundaries

- Property identity is resolved server-side; every plan query is tenant/property scoped.
- Public discovery exposes only guest-safe plan fields.
- Resolver remains authoritative and performs final eligibility validation.
- No service-role credentials or privileged plan data reach the browser.
- No changes to existing bookings, invoices, payments, room inventory, room catalogue, memberships or tenant configuration.
- No production migrations, deployments, commercial rate changes or merges without separate authorization.
- Do not publish or assign the synthetic SPE-03 UAT fixture.

## 6. Acceptance gates

- [ ] Discovery contract returns only eligible, guest-safe plans for the correct property, room and stay.
- [ ] Selected plan is propagated through availability → quote → booking.
- [ ] Multiple-plan ambiguity is resolved only by an explicit guest selection.
- [ ] Every selected plan is revalidated server-side at quote and booking time.
- [ ] Booking snapshot and historical-price invariance are verified.
- [ ] Legacy and single-plan compatibility are verified.
- [ ] Cross-property and stale-plan denial tests pass.
- [ ] CI passes on the exact final commit.
- [ ] Nolmark UAT regression passes with no residual test data.
- [ ] SPE-04.07 accepted before release-readiness is reconsidered.

## 7. Execution sequence

Inspect current plan/publication schema and existing public booking UI contracts → define safe discovery/query contract → implement server and database propagation → wire guest selection → run unit/contract/CI checks → run Nolmark UAT regression → verify no residual data → report acceptance.

**No production release is included in SPE-04.07.**
