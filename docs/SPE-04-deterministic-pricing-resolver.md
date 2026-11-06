# SPE-04 — Deterministic Pricing Resolver

**Priority:** P0 — Revenue correctness  
**Status:** SPE-04.01 COMPLETE · SPE-04.02 CONTRACT BASELINED · SPE-04.03 IMPLEMENTATION COMPLETE · CI VERIFICATION RUNNING  
**Base:** promoted SPE-03 feature baseline  
**Branch:** feat/spe-04-deterministic-pricing-resolver

## 1. Objective

Implement one database-authoritative, property-scoped resolver over immutable SPE-03 publication snapshots. Availability, guest quotes and booking creation must consume the same resolved nightly amounts and restrictions.

This document is the binding SPE-04.02 contract. Implementation must not silently reinterpret it. Any deviation requires an amended contract and explicit approval before code or migration.

## 2. Existing architecture — SPE-04.01 findings

- `calculate_staynas_room_pricing(...)` is the current SPE-02 nightly calculator.
- `calculate_staynas_booking_quote(...)` adds extras and property tax calculation to the room quote.
- `get_staynas_booking_quote(...)` resolves a room slug and calls the shared quote function.
- `get_staynas_room_availability_priced(...)` calls the safe quote wrapper for eligible rooms.
- `create_booking_for_property(...)` calls the shared booking quote before persisting booking totals.
- Server call sites include `src/lib/booking.functions.ts`, `src/lib/public-booking.functions.ts` and `src/routes/api/public/availability.search.ts`.
- SPE-03 introduced immutable publication snapshots, inheritance, seasonal and daily rates, restrictions, room-type assignments and approved override records. The SPE-02 calculation does not yet consume these structures.
- Existing quote RPCs have no selected rate-plan argument. Multiple published plans may be assigned to one room type; no default-plan selector exists.
- The availability safe wrapper currently maps all calculation exceptions to NULL. SPE-04 must retain availability filtering while making configuration/integrity failures observable and distinguishable.

## 3. Rate-plan selection contract

1. The resolver accepts `property_id`, `room_id`, `rate_plan_id` (nullable only for the compatibility-selection rule), stay dates, occupancy and booking timestamp where required.
2. The room must be active and belong to the supplied property. Its catalogue type must be configured for that same property.
3. A candidate plan must be active, have `publication_status='published'`, have a current immutable publication snapshot, be effective for every stay night, and have an active assignment to the room's catalogue type.
4. If a rate-plan ID is supplied, it must satisfy every candidate condition. Otherwise:
   - Exactly one eligible plan: select it.
   - More than one eligible plan: return `RATE_PLAN_REQUIRED`; never select by name, creation order, display order or arbitrary UUID.
   - No eligible plan while the property has any active published rate plan: return `NO_ELIGIBLE_RATE_PLAN`. This is a configuration failure, not legacy fallback.
   - No active published rate plans anywhere in the property: use the legacy compatibility resolver for that property/room only. This preserves pre-SPE-03 properties during controlled migration.
5. A selected plan is fixed for the quote and booking. The booking record/snapshot must retain plan ID, publication ID, publication number, version and snapshot hash. Do not re-select a plan later when displaying or reconciling that booking.
6. Plan effective dates and publication effective dates are inclusive calendar dates. A plan must cover every night of the stay; checkout is not a charged night.

## 4. Published snapshot and currency contract

- Read commercial rate data from the latest immutable publication snapshot for the selected plan, not mutable draft data or a newly recalculated inheritance tree.
- The snapshot's `resolved_data`, publication metadata, room-type assignments and hash form the pricing evidence.
- Property currency must be explicitly configured and valid. Publication currency, selected override currency, daily-rate currency and seasonal-rate currency must equal the property currency. Any mismatch is `CURRENCY_MISMATCH`; no USD or other fallback.
- Property timezone must be explicitly configured and valid. Stay dates are property-local ISO calendar dates. Do not convert a date through server-local timezone or UTC midnight in a way that changes the property's calendar date.
- Resolve the publication snapshot once per quote and use that exact snapshot for every night.

## 5. Nightly rate-source precedence

For each charged property-local night and room catalogue type, select exactly one source in this order:

1. **Approved exact room/date override** — `staynas_rate_overrides.scope='room_date'`, matching property, room and date, status approved.
2. **Approved plan + room-type override** — scope `rate_plan_room_type`, matching selected plan, room type and date.
3. **Approved room-type override** — scope `room_type`, matching room type and date.
4. **Approved plan override** — scope `rate_plan`, matching selected plan and date.
5. **Published daily rate** — `resolved_data.daily_rates[date][room_type_id]`, active and currency-matched.
6. **Published seasonal rate** — active season containing the property-local date and room type. Highest numeric priority wins. Equal-priority overlapping candidates are invalid configuration and fail closed; lexical key order is not a pricing decision.
7. **Published inherited/base rate** — `resolved_data.base_rates[room_type_id]`, after inheritance has already been resolved into the immutable publication.

Additional rules:
- Override date ranges are inclusive. An override is eligible only when its status is approved and it belongs to the same property. Pending, rejected and revoked overrides never affect a quote.
- If more than one approved override matches at the same scope and precedence, return `AMBIGUOUS_RATE_SOURCE`; do not pick an arbitrary row. The SPE-03 overlap validator remains the first line of defence.
- Existing `room_inventory.price_override` values are legacy exact-room/date inputs. During compatibility transition, they may be used only in legacy mode. In published-plan mode they are not an untracked override source. Approved SPE-03 room/date overrides are the only exact-room/date override source.
- The selected source must be recorded for every night: source kind, source record/key, plan/publication/version/hash where applicable, effective date, original amount and currency.
- No rate source, inactive daily rate with no lower-priority source, or malformed rate value must never produce a zero price. Continue to the next lower source only when the higher-priority source is absent or inactive by contract; malformed or currency-invalid configured data is an error, not a reason to fall through.

## 6. Canonical rate data contract

SPE-04.03 must add strict runtime/database validation for the following canonical shapes. SPE-03's generic JSON object storage does not itself guarantee these structures.

### Base rates

`base_rates[room_type_id] = { nightly_rate: positive decimal, currency: ISO-4217 code }`

The amount is interpreted using the selected plan's `pricing_basis`:
- `per_room`: nightly amount per room, regardless of guest count within room capacity.
- `per_person`: nightly amount multiplied by billable occupants (adults + children aged 7+; children below 6 are non-billable, preserving the existing occupancy convention).
- `occupancy_based`: exact occupancy lookup in `occupancy_rules`; no matching entry is `OCCUPANCY_RATE_MISSING`. Never approximate, interpolate or fall back to per-room pricing.

### Occupancy rules

For `occupancy_based`, use an exact key `adults:children_below_6:children_7_plus` under `occupancy_rules[room_type_id]`, with value `{ nightly_rate: positive decimal, currency: ISO-4217 code }`.

For `per_room` and `per_person`, occupancy rules may define explicit included occupants and extra-guest fees only if the complete rule shape is validated. Until that schema is implemented and validated, the legacy room extra-guest fee is not added in published-plan mode. This prevents double charging. Existing room capacity limits remain hard constraints in all modes.

### Daily and seasonal rates

- Daily rate shape remains the SPE-03 contract: `daily_rates[YYYY-MM-DD][room_type_id] = { nightly_rate, currency, active }`.
- Seasonal rate shape remains the SPE-03 contract: `seasonal_rates[season_key] = { start_date, end_date, room_type_ids, nightly_rate, currency, priority, active, ...metadata }`.
- Seasonal date bounds are inclusive. Higher numeric priority wins. Equal-priority overlapping active seasons for the same room type are invalid and fail closed.

## 7. Occupancy, restrictions and legacy-rule interaction

- Room adult, child and maximum occupancy limits are enforced before pricing in both modes.
- Published-plan mode uses the selected snapshot's `occupancy_rules` and `restrictions`; legacy `rooms.extra_guest_fee` and legacy `pricing_rules` monetary adjustments are not layered on top. This prevents duplicate charges.
- Legacy mode continues the existing SPE-02 rules and calculations unchanged until a property is explicitly migrated to published plans.
- All active restrictions that apply to the room type are cumulative; any blocking restriction makes the stay unsellable:
  - `min_los`: arrival date must be within rule dates and stay nights must meet the maximum applicable minimum.
  - `max_los`: arrival date must be within rule dates and stay nights must not exceed the minimum applicable maximum.
  - `closed_to_arrival`: arrival date in rule period blocks the stay.
  - `closed_to_departure`: checkout date in rule period blocks the stay.
  - `stop_sell`: any overlap with a charged night blocks the stay.
  - `advance_booking_min_hours` and `advance_booking_max_days`: require a valid booking timestamp and property-timezone arrival timestamp; missing timestamps when the rule applies are a configuration/input error, not an automatic pass.
- Contradictory minimum/maximum LOS or any restriction that makes the stay impossible fails closed with an explicit restriction reason.
- Restrictions do not mutate inventory, room availability or room status.

## 8. Quote composition and rounding

- The nightly resolver returns accommodation amounts only, plus structured source/adjustment evidence.
- The existing booking quote layer remains responsible for add-ons/extras and property tax calculation. Those amounts are applied once, after nightly accommodation resolution.
- Existing tax inclusion/addition policy and extra-item validation remain unchanged in SPE-04 unless a separate approved change is raised.
- Use PostgreSQL `numeric` arithmetic; no binary floating-point for monetary calculations. Preserve the current persisted two-decimal accommodation/tax precision and existing documented tax-rounding semantics. Round each nightly amount once to two decimal places, then sum rounded nights for the accommodation subtotal.
- Availability and quote endpoints must return the same accommodation subtotal, extras/tax breakdown and total for identical input, property context and selected plan.

## 9. Error taxonomy and availability behaviour

The resolver must expose stable machine-readable error codes, including:
- `PROPERTY_CONTEXT_INVALID`
- `ROOM_NOT_IN_PROPERTY`
- `RATE_PLAN_REQUIRED`
- `NO_ELIGIBLE_RATE_PLAN`
- `RATE_PLAN_NOT_PUBLISHED`
- `RATE_PLAN_NOT_ASSIGNED`
- `RATE_PLAN_OUT_OF_EFFECTIVE_PERIOD`
- `RATE_SOURCE_MISSING`
- `AMBIGUOUS_RATE_SOURCE`
- `CURRENCY_MISMATCH`
- `OCCUPANCY_RATE_MISSING`
- `RESTRICTION_BLOCKED`
- `INVALID_RATE_CONFIGURATION`
- `AUTHORIZATION_DENIED`

Availability may classify a valid room/date/occupancy combination blocked by inventory or a commercial restriction as unavailable. It must not silently convert invalid rate configuration, currency mismatch, ambiguous source or authorization failure into ordinary unavailability. Those failures must surface as a structured error and be logged with property/room/plan context without exposing secrets or cross-tenant data.

## 10. Shared-path and historical snapshot contract

- `calculate_staynas_room_pricing` (or its versioned replacement) is the sole nightly pricing authority.
- `calculate_staynas_booking_quote`, `get_staynas_booking_quote`, `get_staynas_room_availability_priced` and `create_booking_for_property` must all consume that same resolver result.
- TypeScript UI calculators may format/display the database result but must not calculate a second authoritative amount.
- Booking creation persists the selected plan/publication evidence, nightly breakdown, currency, accommodation subtotal, extras and tax snapshot. A later publication cannot change an existing booking's stored commercial snapshot.
- Do not recalculate historical bookings, invoices, payments or completed folios using the current publication.
- Preserve current RPC signatures where feasible. Any required API signature extension must be backward-compatible for legacy-mode properties and validated across every server/public entry point.

## 11. SPE-04 execution gates

- **SPE-04.01 — Discovery:** COMPLETE.
- **SPE-04.02 — Deterministic contract:** BASELINED in this document.
- **SPE-04.03 — Resolver implementation:** next; no production migration or deployment.
- **SPE-04.04 — Shared-path integration:** only after resolver tests pass.
- **SPE-04.05 — Regression:** prove precedence, all override scopes, overlap rejection, inheritance snapshots, inactive/unpublished plans, exact occupancy, restrictions, currency, timezone, property isolation, error taxonomy, rounding and historical snapshot stability.
- **SPE-04.06 — Verification:** CI and isolated read-only UAT. Production release requires separate approval.

## 12. Guardrails

- No production migration, production deployment or live commercial rate changes without separate approval.
- No edits to existing bookings, invoices, payments, inventory, room data, membership roles or tenant configuration.
- Do not publish or assign the synthetic SPE-03 UAT fixture. It is non-commercial and remains draft.
- Do not create fabricated sellable rates to make tests pass.
- Keep SPE-04 changes on `feat/spe-04-deterministic-pricing-resolver`; PR remains draft until its release gates pass.


### SPE-04.03 implementation log — first database guard

Migration `20261106170000_spe04_base_occupancy_validation.sql` adds a database trigger that validates canonical `base_rates` and exact `occupancy_rules` JSON shapes before a rate-plan row can be inserted or changed. It enforces property-catalogue room-type scope, positive numeric rates, uppercase ISO-4217 currency matching, exact occupancy key format, supported count bounds, and pricing-basis compatibility. It raises stable `INVALID_RATE_CONFIGURATION` or `CURRENCY_MISMATCH` error identifiers. The migration is committed to the SPE-04 feature branch only and has not been applied to any database.

This is the first SPE-04.03 implementation slice, not resolver completion. The database-authoritative published-snapshot resolver, source precedence, restrictions, shared-path integration, and resolver-level tests remain open. Do not route quote/availability/booking calls through this guard or describe SPE-04.03 as passed until those pieces are implemented and verified.



### SPE-04.03 — implementation complete

- `20261106170000_spe04_base_occupancy_validation.sql`: strict database validation for canonical `base_rates` and exact `occupancy_rules`, property catalogue scope, positive numeric rates, ISO-4217 currency equality, occupancy-key syntax/count bounds and pricing-basis compatibility.
- `20261106180000_spe04_published_pricing_resolver.sql`: database-authoritative resolver reading the latest immutable publication snapshot; explicit plan selection when multiple plans qualify; property/room isolation; approved override → daily → seasonal → occupancy/base precedence; deterministic seasonal priority; cumulative LOS, arrival/departure, stop-sell and advance-booking restrictions; property-local timezone; per-person and exact occupancy pricing; nightly source evidence; structured fail-closed errors.
- Legacy SPE-02 calculation remains the compatibility path only when the property has no active published plans. No competing TypeScript pricing calculator was introduced.
- `supabase/tests/spe04_published_pricing_resolver.test.sql`: pgTAP contract tests for resolver signature, result type, SECURITY DEFINER, grants and validation triggers.
- Quote, availability and booking entry points remain unchanged in SPE-04.03; integration is the next milestone after resolver acceptance.
- Migrations and pgTAP tests are committed to this feature branch only. They have not been applied or executed against UAT or production.
