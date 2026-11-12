# CPS-06 — Implementation notes

Status: implementation branch / UAT preparation. Not accepted and not production-ready.

## Safety boundary
- The agreed UAT identity is the live Nolmark CDMA property (TZS, Africa/Dar_es_Salaam).
- Its existing operational records are read-only during this work.
- Do not apply this migration to the shared production Supabase schema or deploy the branch to production.
- The public production application must not be represented as a UAT deployment.

## Current implementation
- Additive durable attribution and analytics event tables with property/session idempotency.
- First-touch immutability and qualifying-external last-touch updates.
- Public permanent booking-page view ingestion and campaign-page/CTA event ingestion.
- Booking-start and availability-search funnel events from the verified public booking request path.
- Quote-generation attribution upsert and quote attachment in the canonical quote server flow.
- Quote-to-reservation attribution inheritance and reservation/payment references on the attribution record.
- Server-confirmed reservation, successful payment, cash refund and Pesapal provider-reversal lifecycle capture.
- Campaign ID propagation from attribution through reservation and payment events.
- Property-scoped server aggregation with currency-separated gross booking value and net collected, including campaign-level currency buckets.
- Authenticated direct-booking analytics server function and Performance & Attribution dashboard.
- Preset and custom reporting windows, local-property-timezone boundaries, and CSV export.
- Role-based module entitlement and navigation entry for owner, manager, finance and marketing.

## Verification and remaining acceptance work
- Migration remains unapplied to the shared production database. No existing Nolmark reservation/payment rows were modified.
- Nolmark CDMA remains the agreed UAT reference tenant; its current records were inspected read-only.
- Run final P1 build/test and CPS-04 isolated-database migration/test workflows on the latest branch head.
- Validate quote, reservation, payment and refund lifecycle behavior with isolated synthetic fixtures; do not mutate the live Nolmark operational records.
- Add detailed source/medium/campaign/content/referrer/landing-page/device drill-down, campaign offer reporting, and export audit records.
- Complete privacy consent/retention controls and entitlement-catalogue enforcement.
- Complete full Mtoni/Nolmark UAT reconciliation after isolated test execution is available.
- No production deployment or promotion until all required checks pass and explicit release approval is given.

## Metric contract
- Views and journey actions are browser-observed and deduplicated by property + event key.
- Reservation and payment lifecycle events are server-derived from operational ledgers.
- Gross booking value is not collected revenue.
- Net collected = successful payment events less verified refunds/reversals.
- Currency totals are never cross-added.
- Missing attribution remains unattributed.
