# SPE-08 — Pricing Intelligence

## Architecture and authority

SPE-08 adds a property-scoped decision-support layer. It does not replace the SPE-04 deterministic resolver, SPE-05 tax/fee/promotion quote composition, SPE-06 booking transaction or SPE-07 distribution outbox/inbox.

The intelligence tables are additive:
- `staynas_pricing_intelligence_runs`: traceable analytics/data-quality runs.
- `staynas_pricing_forecasts`: forecast method, horizon, input coverage, confidence proxy and limitations.
- `staynas_pricing_recommendations`: immutable proposal/evidence plus review state.
- `staynas_pricing_recommendation_events`: append-only review/execution evidence.
- `staynas_pricing_scenarios`: isolated hypothetical outputs.
- `staynas_competitor_observations`: source-attributed, timestamped, currency-aware observations.

Property-facing reads and writes require authenticated property membership and owner/manager/finance/admin role. Founder AI configuration remains outside property-facing controls. No model credentials are exposed and no generative AI call is required for deterministic analytics.

## Metric contract

- Booking value: reservation `bookings.total`, including its configured extras/tax composition; never labelled accommodation revenue.
- Booked accommodation value: sum of `booking_nights.nightly_rate` for confirmed, checked-in and completed reservations in the selected stay-date range. This excludes booking-level taxes and fees by construction.
- Completed accommodation value: booking-night nightly rates for reservations with completed status. It is an operational proxy, not an accounting-recognized revenue figure.
- ADR: booked accommodation value divided by booked room nights, reported by currency.
- RevPAR: booked accommodation value divided by configured room units × calendar days, reported by currency.
- Booked occupancy: qualifying booking-night rows divided by configured room units × calendar days. It is not physical occupied inventory.
- ALOS: qualifying stay nights divided by qualifying reservations.
- Lead time: check-in date less reservation creation date.
- Cancellation/no-show rates: cancelled/no-show reservations divided by all reservations inspected in the period.
- Booking-date reporting uses `created_at`; stay-date reporting uses `booking_nights.date`.
- Currencies are never combined. No exchange-rate conversion policy is configured.

Recognized revenue, tax/fee contribution, discount impact, commission and promotion effectiveness are explicitly unavailable until an authoritative accounting classification and source ledger is configured.

## Forecast method

`weekday-occupancy-baseline-v1` uses completed/checked-in historical booking-night rows, grouped by weekday. For each future date, expected occupancy is the greater of confirmed forward occupancy and the historical weekday mean. The method requires at least 28 distinct historical stay dates and at least five weekdays with three or more observations. Otherwise it returns `insufficient_data`.

The confidence value is a coverage proxy capped below 0.75, not a calibrated probability. Per-date uncertainty is a sample-size proxy. No holdout backtest or forecast accuracy claim is made. Financial revenue forecasts and seasonal uplift are not inferred.

## Recommendations and authority

The initial deterministic rule identifies dates where the weekday baseline is at least 85% and exceeds confirmed forward occupancy by at least 10 percentage points. It recommends a human review of published pricing; it does not propose an unsupported numeric rate or revenue uplift.

Approval records a decision only. It does not publish a rate, activate a promotion, mutate a reservation, or enqueue distribution. An authorized user must separately use the existing versioned rate-plan publication workflow. Decision and audit evidence are stored under the active property.

## Scenario boundary

Scenario baseline comes from `resolve_staynas_published_room_pricing`, the canonical SPE-04 resolver. The proposed accommodation amount applies a user-supplied percentage to the resolved accommodation subtotal. This is explicitly accommodation-only: taxes, fees, promotions, demand elasticity and occupancy response are not recomputed or forecast. It is not a payable quote and writes only a scenario record.

## Market intelligence

The schema accepts source name/reference, observed timestamp, currency, room/rate-plan comparability and observed/estimated classification. No competitor feed is configured. The dashboard must show market intelligence as unconfigured until a lawful, reliable source is connected. Staleness is evaluated from observation timestamps by consumers; no stale data is presented as live.

## Current scope limits / release gates

- Historical data coverage and completeness must be measured in the target UAT tenant.
- The initial analytics endpoint uses bounded property-scoped booking and booking-night reads; larger-scale aggregation should move to indexed database aggregates/background jobs after profiling.
- The initial forecast is an occupancy baseline, not a validated financial forecast.
- Recommendation scans are deterministic and evidence-led; no external LLM inference is needed.
- Scenario simulation does not yet recompute SPE-05 taxes/fees/promotions on hypothetical rates.
- Channel commission, discount and promotion effectiveness require authoritative booking snapshot and distribution settlement evidence not yet certified.
- SPE-05, SPE-06 and SPE-07 remain unmerged prerequisite PRs; SPE-07 provider certification and SPE-06 browser/concurrency/payment reconciliation gates remain outstanding.
- No production migrations, production database writes, merge, Vercel deployment or provider activation are included.
