# SPE-04 — Deterministic Pricing Resolver

**Priority:** P0 — Revenue correctness  
**Programme:** StayNas Revenue Management  
**Status:** OPEN — discovery and contract phase  
**Base:** promoted SPE-03 feature baseline

## Objective

Implement one deterministic, property-scoped pricing resolver that consumes the published SPE-03 rate-plan model and becomes the authoritative nightly-rate source for guest quotes, availability pricing and booking creation.

## Initial repository findings

- SPE-02 introduced `public.calculate_staynas_room_pricing(...)` as the shared database-authoritative path for availability, guest quotes and booking creation.
- That function currently resolves legacy room base price, inventory price override, occupancy surcharge and `pricing_rules`.
- SPE-03 introduced property-scoped rate plans, inheritance, seasonal rates, exact-date daily rates, restrictions, publication/versioning and room-type assignments.
- SPE-03 daily-rate migration explicitly reserves exact-date override precedence ahead of seasonal/base rates for SPE-04.
- The existing resolver and SPE-03 published rate-plan catalogue must be reconciled into one precedence contract. No second quote calculator is permitted.

## Resolver contract to specify and verify

1. Resolve only an active property and an explicitly selected or deterministically designated published rate plan assigned to the requested room catalogue type.
2. Resolve inherited rate-plan data through the existing property-scoped inheritance contract. Draft, suspended and archived plans must never be sellable.
3. Nightly precedence: exact-date active daily rate/override → eligible active seasonal rate selected by deterministic priority → explicitly approved legacy/base fallback. No ambiguous tie resolution.
4. Enforce property currency and timezone. Reject missing or mismatched currency rather than falling back to USD.
5. Apply occupancy/extra-guest pricing, restrictions, minimum-stay and blackout rules exactly once and consistently across all nights.
6. Return a structured, auditable nightly breakdown including source plan/version, source rule/season/override, applied adjustments, currency and final totals.
7. Availability, guest quote and booking creation must call the same authoritative resolver and produce identical totals for identical inputs.
8. Preserve booking snapshots and historical pricing. Resolver changes must not rewrite existing reservations or invoices.
9. Enforce property isolation and authorization. No cross-property rate-plan or room-type resolution.

## Execution sequence

- **SPE-04.01 — Discovery and gap report:** inspect the SPE-02 resolver, SPE-03 schema/contracts and all quote/availability/booking call sites; publish the existing behaviour and gaps.
- **SPE-04.02 — Deterministic contract:** define typed resolver inputs/outputs and the precedence specification before implementation.
- **SPE-04.03 — Resolver implementation:** implement the database-authoritative resolver with explicit property and rate-plan context.
- **SPE-04.04 — Shared-path integration:** route availability, quote and booking creation through the same resolver; remove duplicate calculations only after parity tests.
- **SPE-04.05 — Regression suite:** precedence, overlaps, inheritance, unpublished/inactive plans, occupancy, restrictions, min-stay, blackout, currency, timezone/date boundaries, property isolation, rounding and snapshot stability.
- **SPE-04.06 — Verification:** CI and read-only UAT; prove quote/availability/booking parity before any migration or deployment approval.

## Guardrails

- No production migration, production deployment or live commercial rate changes without separate approval.
- No parallel quote calculator.
- Do not alter existing bookings, invoices, payments, inventory, room data, membership roles or tenant configuration.
- Use isolated UAT fixtures; do not invent sellable prices.
- Keep work in this feature branch. Do not merge until all acceptance gates pass.

## Acceptance gates

- One authoritative resolver for all three pricing entry points.
- Deterministic precedence with no ambiguous overlaps or silent fallback.
- Exact currency and tenant/property scoping.
- Stable historical booking snapshots.
- CI green and regression tests prove exact parity across availability, quote and booking creation.
- Read-only UAT and explicit release approval.
