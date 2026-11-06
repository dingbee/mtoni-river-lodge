# SPE-04.10 — Canonical Pricing Service Integration

**Status:** INTEGRATION AUDIT PASS · CONTRACT TESTS ADDED · CI PENDING  
**Branch:** `feat/spe-04-deterministic-pricing-resolver`  
**PR:** #151 (draft; unmerged)

## Objective

Ensure availability, guest quotes and booking creation use one database-authoritative pricing path. Prevent frontend recalculation, duplicate taxes/fees, or a second booking-time monetary resolver.

## Audit findings

### Database call chain

- `calculate_staynas_room_pricing` is the shared adapter. It routes published-plan properties to `resolve_staynas_published_room_pricing`; only properties with no active published plans enter `calculate_staynas_room_pricing_legacy`.
- `calculate_staynas_booking_quote` composes the shared accommodation result with property-scoped extras and one call to `calculate_staynas_booking_taxes`.
- `try_calculate_staynas_booking_quote` wraps the canonical quote for availability and returns a structured fail-closed error on exception.
- `get_staynas_room_availability_priced` consumes that safe quote; the selected-plan wrapper sets transaction-local rate-plan context and delegates to the same availability function.
- `get_staynas_booking_quote_with_rate_plan` sets transaction-local plan context and delegates to the same quote composer.
- `create_booking_for_property` calls the canonical quote once, rejects pricing errors before persistence, then stores the returned quote in `bookings.pricing_snapshot` and the returned nightly rows in `booking_nights`. It consumes quote tax fields rather than recalculating tax.
- `create_booking_for_property_with_rate_plan` sets plan context and delegates to the same booking transaction.

### Application call-site audit

- `src/lib/booking.functions.ts`: availability, quote and booking all use the selected-plan database RPC contracts; no client monetary total is computed in these server functions.
- `src/lib/public-booking.functions.ts`: public availability and booking use the selected-plan RPCs; property identity is resolved server-side from the explicit public demo allowlist.
- `src/routes/api/public/availability.search.ts`: partner/API availability uses the selected-plan priced availability RPC and returns structured pricing errors and plan choices.
- The public booking UI renders server-returned totals and nightly explanation data; no rate calculation was added in the browser.
- `src/lib/pricing.ts` retains a legacy compatibility helper and formatting utilities; its database-driven guards throw rather than provide a fallback rate. It is not the SPE-04 authoritative path.

## Nolmark UAT evidence

A read-only transaction exercised `get_staynas_booking_quote_with_rate_plan` for the existing Flexible UAT fixture, 10–12 December 2026, two adults:
- Accommodation subtotal: USD 222.
- Two nightly lines: USD 111 each.
- Extras total: USD 0.
- Taxes/tax addition: USD 0 in this fixture.
- Quote total: USD 222.
- Pricing evidence includes the selected plan, publication ID/version/hash and property timezone.

The transaction was rolled back. No booking or inventory writes occurred.

Database function-definition inspection confirmed that availability, quote and booking route through the same canonical functions. The pgTAP contract suite `supabase/tests/spe04_10_canonical_service_integration.test.sql` adds nine source-contract assertions.

## Verification limitations

- UAT runtime quote regression passed.
- pgTAP runner is unavailable in UAT; the nine assertions were authored but not executed.
- CI for the current branch head is pending.
- No authenticated browser review of the SPE-04.09 nightly breakdown has been completed.
- No load/concurrency test has been performed.

## Change control

- No production migrations/deployment, merge or live pricing changes.
- No production booking, inventory, tenant or membership records were touched.
- PR #151 remains draft and unmerged.
