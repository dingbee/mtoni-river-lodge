# SPE-04 — Deterministic Pricing Resolver

**Priority:** P0 — Revenue correctness  
**Programme:** StayNas Revenue Management  
**Status:** OPEN — SPE-04.01 discovery complete; SPE-04.02 contract pending  
**Base:** promoted SPE-03 feature baseline

## Objective

Implement one deterministic, property-scoped pricing resolver that consumes immutable SPE-03 publication snapshots and becomes the authoritative nightly-rate source for guest quotes, availability pricing and booking creation.

## SPE-04.01 — repository audit

### Existing authoritative path

- SPE-02 introduced `public.calculate_staynas_room_pricing(...)`.
- `calculate_staynas_booking_quote(...)` calls the room resolver and adds extras and property tax calculations.
- `get_staynas_booking_quote(...)` resolves a room slug and calls the shared booking quote.
- `get_staynas_room_availability_priced(...)` calls `try_calculate_staynas_booking_quote(...)` for each eligible room.
- `create_booking_for_property(...)` calls `calculate_staynas_booking_quote(...)` before persisting the booking totals.
- Server entry points in `src/lib/booking.functions.ts`, `src/lib/public-booking.functions.ts` and `src/routes/api/public/availability.search.ts` call these database RPCs. These are the integration points to preserve.

### Current SPE-02 calculation behaviour

The existing room resolver currently:
- Requires a valid active property, room belonging to that property, explicit property currency, matching room currency, valid dates and valid occupancy.
- Starts from `rooms.base_price`, overridden by `room_inventory.price_override` for an exact room/date.
- Adds the extra-occupant surcharge.
- Applies one eligible `pricing_rules` adjustment per night, ordered by room specificity, ascending priority, then stable rule ID.
- Applies minimum-stay and blackout constraints.
- Returns nightly rows and accommodation subtotal; the booking quote then adds extras and taxes.

### SPE-03 pricing structures now available

- `staynas_rate_plans.rate_plan_data` contains inheritable `base_rates`, `seasonal_rates`, `daily_rates`, `occupancy_rules` and `restrictions`.
- Parent/child data is resolved by `resolve_staynas_rate_plan_inheritance`.
- Publishing creates an immutable `staynas_rate_plan_publications` snapshot with resolved data, lineage, inheritance trace, policy, room-type assignments, version and snapshot hash.
- `get_staynas_published_rate_plans` returns the latest publication snapshot for each currently published and active plan.
- Assignments are property-scoped in `staynas_rate_plan_room_types`. The assignment model has display order but no default-plan flag.
- `staynas_rate_overrides` supports `room_date`, `room_type`, `rate_plan` and `rate_plan_room_type` scopes with pending/approved/rejected/revoked lifecycle and immutable approved terms.
- SPE-03 explicitly documents the first part of the precedence: approved exact-date override → published daily calendar → seasonal rate → inherited/base rate. Non-room-date override scopes are recorded for SPE-04 but their precedence is not yet specified.

### Confirmed integration gap

The SPE-02 booking/availability SQL path does not currently consume SPE-03 publication snapshots, inherited rate-plan rates, seasonal rates, daily rates or the non-room-date override scopes. The live calculation remains legacy room/inventory/pricing_rules based. SPE-03 deliberately deferred that integration to SPE-04.

### Additional parity and observability risks

- The current quote/availability/booking RPC signatures do not accept a rate-plan identifier or code.
- Multiple published plans may be assigned to one room type, but no default-plan selector exists. Selection cannot safely depend on row order or plan name.
- `try_calculate_staynas_booking_quote` catches all exceptions and returns NULL; SPE-04 must ensure invalid configuration is not silently misrepresented as ordinary unavailability.
- `src/domains/finance/pricing-engine.ts` is a deterministic TypeScript calculator for the legacy room/rule model. `src/lib/pricing.ts` adapts legacy display data into it with empty inventory and rules. It is not the database-authoritative SPE-03 resolver and must not become a competing quote authority.

## SPE-04.02 — contract decisions required before implementation

1. **Plan selection:** require an explicit plan identifier/code when multiple published plans are assigned; permit implicit selection only when exactly one eligible published plan exists, unless a separately approved default-plan mechanism is added. If no eligible plan exists, define an explicit legacy-compatibility policy rather than silently selecting.
2. **Rate-source precedence:** preserve the documented exact-date override → published daily rate → seasonal rate → inherited/base rate ordering. Define how approved `rate_plan_room_type`, `room_type` and `rate_plan` overrides fit without ambiguous overlap.
3. **Occupancy and adjustment semantics:** specify whether occupancy rules are rate-plan base inputs or post-rate surcharges, and define interaction with legacy extra-guest fees and `pricing_rules` so no adjustment is applied twice.
4. **Restrictions:** reconcile SPE-03 rate-plan restrictions with SPE-02 minimum-stay/blackout `pricing_rules`; define deterministic conflict handling.
5. **Snapshot policy:** use immutable publication snapshot content as the commercial rate source. A later draft edit or publication must not mutate a quote already issued or a booking already stored.
6. **Error contract:** distinguish unavailable inventory from invalid/missing rate configuration and authorization failures; do not collapse all resolver errors into a NULL quote.

## Resolver contract

- Resolve only an active property, an active room belonging to it, and an eligible published rate-plan snapshot assigned to that room's catalogue type.
- Resolve inherited values from the immutable publication snapshot, not mutable draft rows.
- Enforce effective dates, currency, timezone, occupancy, restrictions, minimum-stay and blackout constraints exactly once.
- Return a structured, auditable nightly breakdown including property, room, selected plan, publication/version/hash, source rate domain/key, applied override/rule, adjustments, currency and totals.
- Availability, guest quote and booking creation must call the same authoritative resolver and produce identical totals for identical inputs.
- Preserve historical booking snapshots; resolver changes must not rewrite existing reservations or invoices.
- Enforce property isolation and authorization. No cross-property rate-plan or room-type resolution.

## Execution sequence

- **SPE-04.01 — Discovery and gap report:** COMPLETE. Existing paths, data structures, deferred integration and unresolved selection/precedence decisions documented here.
- **SPE-04.02 — Deterministic contract:** publish typed resolver inputs/outputs, plan selection policy, override precedence, occupancy/restriction semantics and error taxonomy.
- **SPE-04.03 — Resolver implementation:** implement the database-authoritative resolver against immutable publication snapshots.
- **SPE-04.04 — Shared-path integration:** route availability, quote and booking creation through the same resolver; remove duplicate calculations only after parity tests.
- **SPE-04.05 — Regression suite:** precedence, overlaps, inheritance, unpublished/inactive plans, occupancy, restrictions, min-stay, blackout, currency, timezone/date boundaries, property isolation, rounding, errors and snapshot stability.
- **SPE-04.06 — Verification:** CI and read-only UAT; prove quote/availability/booking parity before any migration or deployment approval.

## Guardrails

- No production migration, production deployment or live commercial rate changes without separate approval.
- No parallel quote calculator.
- Do not alter existing bookings, invoices, payments, inventory, room data, membership roles or tenant configuration.
- Use isolated UAT fixtures; do not invent sellable prices.
- Keep work in this feature branch. Do not merge until all acceptance gates pass.

## Acceptance gates

- One authoritative resolver for all three pricing entry points.
- Deterministic plan selection and rate-source precedence with no ambiguous overlaps or silent fallback.
- Exact currency and tenant/property scoping.
- Stable historical booking snapshots.
- Correct distinction between unavailable inventory and invalid pricing configuration.
- CI green and regression tests prove exact parity across availability, quote and booking creation.
- Read-only UAT and explicit release approval.
