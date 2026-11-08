# DC-06.05 — Cross-Domain Reconciliation & Tenant-Isolation Regression

Status: implementation branch / CI contract under verification  
Base: DC-06.04 head `3ad07659223135a15265258ce3f51c966327bc3e`  
Scope: distribution operation ledger, outbox, webhook inbox/attempts, canonical reservation links, operational projections, provider financial evidence and canonical payment records.

## Reconciliation invariants

1. Provider reservation identity is unique by provider, external account and external reservation ID.
2. A canonical booking has at most one distribution reservation link.
3. Operational reservation projection is unique per canonical booking; operational event projection is unique per source inbox event.
4. Replaying a webhook or integration must not duplicate canonical bookings, operational events, room allocations or operational tasks.
5. Distribution execution ledgers remain inaccessible through direct anonymous/authenticated table reads.
6. Tenant-facing operational projections are read-only to authenticated users and protected by RLS/property authorization.
7. Provider financial evidence remains a separate, provenance-linked, immutable evidence ledger. It is not a payment event and does not mutate booking payment fields.
8. No cross-currency aggregation, payment posting, settlement, refund, provider dispatch or event replay is introduced by this milestone.

## Verification added

`scripts/ci/dc06-05-cross-domain-reconciliation-smoke.sql` checks the disposable PostgreSQL schema for:
- required cross-domain relations;
- RLS and least-privilege grants on service ledgers;
- immutable operation-attempt and financial-evidence records;
- provider reservation and canonical booking uniqueness;
- operational projection idempotency constraints;
- financial evidence provenance and separation from canonical payment events;
- authenticated read-only access to property-scoped operational projections;
- active-property authorization and read-only analytics projection semantics.

The existing DC-05.07 PostgreSQL UAT remains the runtime test for channel reservation integration, replay, operational task uniqueness and preservation of booking payment state. DC-05.08 real provider sandbox and authenticated property-staff walkthrough remain deferred acceptance evidence and are not replaced by CI.

## Explicit exclusions

No production database migration, production data access, merge, deployment, provider activation, event replay, financial mutation or Vercel action.
