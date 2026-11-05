# SPE-04.04 — Shared Pricing Path Integration

**Programme:** StayNas — SPE-04 Deterministic Pricing Resolver  
**Status:** IN PROGRESS — integration contract and call-path inventory  
**Branch:** `feat/spe-04-deterministic-pricing-resolver`  
**PR:** #151  
**Prerequisite:** SPE-04.03 accepted by founder  
**Release boundary:** feature branch only; no database application, merge, or deployment

## Objective

Route every commercial quote path through the SPE-04.03 database-authoritative resolver while preserving the existing transactional booking, extras, tax, inventory, and payment semantics.

The published resolver becomes the sole accommodation-price authority for properties with active published rate plans. The SPE-02 calculator remains the compatibility authority only for properties with no active published plans.

## Existing call-path inventory

| Entry point | Current path | Required SPE-04.04 path |
|---|---|---|
| Guest quote | `get_staynas_booking_quote` → `calculate_staynas_booking_quote` → `calculate_staynas_room_pricing` | Same outer contract; accommodation delegates to SPE-04 resolver |
| Availability | `get_staynas_room_availability_priced` → safe quote wrapper | Same resolver and quote composition; inventory remains independent |
| Booking creation | `create_booking_for_property` → shared booking quote | Same resolver inside existing transaction and locks |
| Public booking network | public server functions call quote/availability/booking RPCs | No client-side monetary calculation; same database paths |
| External availability API | `/api/public/availability/search` calls priced availability RPC | Same authoritative result and explicit configuration failure handling |

## Integration invariants

1. **Single authority:** all charged nights use one resolver result and one immutable publication snapshot.
2. **Legacy compatibility:** only properties with zero active published plans use the existing SPE-02 calculator. A published-plan configuration error never falls back to legacy pricing.
3. **Selection:** no arbitrary default plan. If more than one plan is eligible, return `RATE_PLAN_REQUIRED`. Explicit plan selection is accepted only after property, assignment, publication and effective-period validation.
4. **Quote composition:** extras and taxes remain in the existing quote layer and are applied exactly once after accommodation resolution.
5. **Availability:** inventory/holds remain independent from rate resolution. A restriction or zero stock may make a room unavailable; invalid configuration, currency mismatch, ambiguous source and authorization failures must remain distinguishable from ordinary stock unavailability.
6. **Booking transaction:** retain current row locks, hold validation, stock decrement, extra validation, tax calculation, booking-night writes and calendar event behavior.
7. **Historical pricing:** persist selected plan ID, publication ID/number, plan version, snapshot hash, per-night source evidence, currency and the full quote snapshot in the booking's existing `pricing_snapshot`. Never reprice an existing booking.
8. **No side effects:** resolver remains read-only. It must not mutate inventory, room state, reservations, payments, memberships or tenant configuration.
9. **Backward compatibility:** retain existing RPC signatures and grants wherever feasible. Any added optional rate-plan argument must be propagated through every server entry point and remain nullable only under the deterministic selection rule.
10. **Money:** PostgreSQL `numeric` only; preserve the current two-decimal nightly rounding and existing tax/extras semantics.

## Required implementation slices

### 04.04-A — Resolver adapter
- Preserve the existing SPE-02 function as a separately named legacy implementation.
- Make the existing shared accommodation function a compatibility adapter:
  - no active published plan → legacy implementation unchanged;
  - active published plan(s) → SPE-04.03 resolver;
  - structured resolver failure → explicit error, never a zero quote or legacy fallback.
- Normalize the resolver's nightly evidence into the existing quote response without discarding source metadata.

### 04.04-B — Quote composition
- Keep extras and tax calculation unchanged.
- Include rate-plan/publication evidence in the quote snapshot.
- Propagate resolver error codes without converting them to a successful quote.

### 04.04-C — Availability
- Use the same quote/resolver path as guest quote and booking.
- Preserve stock/hold calculations.
- Distinguish ordinary unavailability from pricing/configuration errors in the result contract.
- Never sort or advertise a failed quote as a zero-priced room.

### 04.04-D — Booking creation
- Keep existing transactional locks and validation.
- Resolve pricing within the same transaction immediately before booking persistence.
- Reject structured pricing errors before any booking, inventory decrement, booking-night or payment-related write.
- Persist complete immutable evidence in `bookings.pricing_snapshot` and `booking_nights.pricing_snapshot`.
- Verify rollback semantics on all failure paths.

### 04.04-E — Public/server entry-point parity
- Verify internal quote, public booking, public availability API and booking creation pass identical property, dates and occupancy.
- Add explicit optional plan selection only if the public contract can carry it end-to-end; do not infer a plan from browser-supplied display order.
- No TypeScript monetary calculator becomes authoritative.

## Acceptance criteria

- [ ] SQL migration compiles against the exact SPE-02/SPE-03 schema in isolated UAT.
- [ ] Legacy-only property produces byte-for-byte equivalent monetary quote to the SPE-02 calculator for representative inputs.
- [ ] One eligible published plan produces identical nightly accommodation totals in quote, availability and booking.
- [ ] Multiple eligible plans produce `RATE_PLAN_REQUIRED` consistently.
- [ ] No eligible plan while any active published plan exists produces `NO_ELIGIBLE_RATE_PLAN`; no legacy fallback.
- [ ] Resolver configuration/currency/authorization errors cannot become zero-priced availability or successful booking.
- [ ] Extras and tax are applied once and remain unchanged.
- [ ] Booking persists publication/version/hash and per-night source evidence.
- [ ] Failed quote/booking leaves bookings, booking nights, inventory, holds and payments unchanged.
- [ ] Historical booking snapshots remain unchanged after a later publication.
- [ ] Property isolation tests prove no cross-property plan/rate evidence is read.
- [ ] Build, unit tests, finance integrity checks and SQL integration tests pass.

## Explicit exclusions

- No production migration or deployment.
- No changes to production rates, bookings, invoices, payments, inventory, room records, memberships or tenant settings.
- No publishing or assigning the synthetic SPE-03 UAT fixture.
- No fabricated commercial rates.
- No UI redesign or commercial pricing-policy changes.

## Engineering note

The current SPE-04.03 resolver is a standalone function and is not yet called by the SPE-02 quote/availability/booking chain. The integration must preserve the old calculator under a legacy-only name before routing the shared entry point through the new resolver; otherwise the resolver's own legacy fallback would recurse. This dependency is mandatory and must be covered by a regression test.
