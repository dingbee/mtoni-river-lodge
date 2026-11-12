# CPS-06 — Implementation notes

Status: implementation branch / UAT preparation. Not accepted and not production-ready.

## Safety boundary
- The agreed UAT identity is the live Nolmark CDMA property (TZS, Africa/Dar_es_Salaam).
- Its existing operational records are read-only during this work.
- Do not apply this migration to the shared production Supabase schema or deploy the branch to production.
- The public production application must not be represented as a UAT deployment.

## Current implementation
- Additive durable attribution and analytics event tables.
- Server-only attribution upsert and quote-attachment RPCs.
- Immutable first-touch and qualifying-external last-touch semantics.
- Quote-to-booking attribution inheritance trigger.
- Booking lifecycle and payment-ledger lifecycle event triggers.
- Idempotent event keys scoped to property.
- Property-scoped aggregation RPC with separate currency buckets.
- Authenticated direct-booking analytics server function and dashboard route.
- Role-based module entitlement for owner, manager, finance and marketing.

## Known incomplete acceptance items
- Wire public permanent and campaign page observations to the ingestion RPC.
- Attach attribution during the existing quote-generation server flow and preserve it through reservation creation.
- Verify the real payment event type and reversal/refund conventions against the deployed database schema.
- Add custom date selection and CSV exports.
- Add source/medium/campaign/content/referrer/landing-page drill-down and device capture.
- Add entitlement catalogue enforcement, retention/consent policy and export audit records.
- Add automated database/RLS/idempotency/reconciliation tests.
- Execute the migration and UAT only in an explicitly isolated schema/database. The live Nolmark tenant remains read-only until then.

## Metric contract
- Views and journey actions are browser-observed and deduplicated by property + event key.
- Reservation and payment lifecycle events are server-derived from operational ledgers.
- Gross booking value is not collected revenue.
- Net collected = successful payment events less verified refunds/reversals.
- Currency totals are never cross-added.
- Missing attribution remains unattributed.
