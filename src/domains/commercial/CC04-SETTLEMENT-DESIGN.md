# CC-04 — Subscription Billing, Collections and Settlement

Status: CC04.01 contract foundation in progress on `feat/cc04-subscription-settlement-foundation`. No production financial records, migrations, provider credentials or payment actions have been changed.

## Domain boundary

CC-04 owns StayNas commercial subscription billing and collection: invoice snapshots, receivables, payment attempts, provider settlement verification, allocations, reversals, reconciliation and auditable financial history.

CC-04 is not the hospitality booking payment domain. Existing `bookings`, `payment_events`, `payments.functions.ts`, `payment-finalize.server.ts` and booking/Pesapal RPCs remain dedicated to property guest payments. CC-04 must not write booking payment status, use booking references as invoice IDs, or share booking settlement tables.

## Authority and invariants

- Nolmark CDMA founder administration controls global commercial billing configuration, manual settlement approval, write-offs, reversals and exceptional adjustments.
- Tenant administrators may view their own invoices and payment history and initiate payment against their own tenant invoice. They cannot mark an invoice paid, confirm settlement, alter pricing or change provider credentials outside tenant-scoped settings.
- System/provider service principals ingest provider notifications, query the provider server-side and persist evidence. A notification/IPN is not settlement confirmation.
- Every financial amount is integer ISO-4217 minor units; TZS and USD are isolated. No implicit FX conversion, currency fallback or mixed-currency totals.
- Invoice lines and totals are immutable after issue. Amendments use credit/debit notes or a replacement invoice; never rewrite issued financial evidence.
- Payment attempts are idempotent and scoped to tenant, provider account, invoice and currency.
- Allocation requires a server-verified provider result with exact invoice currency and exact expected amount. Partial allocations are supported; over-allocation is rejected.
- Provider reversals, refunds, credits and chargebacks are separate signed financial events with original settlement linkage and approval/audit evidence.
- Subscription billing never mutates hospitality booking payments or guest folios.
- A successful collection is not itself a subscription-period extension. CC-04 emits durable verified settlement evidence; CC-03 consumes that evidence and performs its own authorized lifecycle transition.
- Billing must fail closed if CC-02 has not supplied an active immutable price resolution, exact currency/term, plan version, property/add-on composition and accepted commercial snapshot. No amounts are invented.

## Settlement lifecycle

1. Resolve approved CC-02 price and accepted subscription snapshot.
2. Create immutable invoice and line-item snapshots; assign a stable invoice number and due date.
3. Create a tenant-scoped payment attempt using a configured provider account.
4. Persist inbound provider notifications as untrusted evidence.
5. Query the provider from the server using the stored provider order reference.
6. Reconcile provider amount, currency, account, order and status against the payment attempt and invoice.
7. In one database transaction, append verified settlement evidence, allocate the amount, update invoice balance/status and append audit/ledger records.
8. Route partial payment, mismatch, duplicate, delayed notification and reversal to explicit states; never silently mark paid.
9. Publish a settlement-confirmed event for CC-03. Only after CC-04's verified settlement evidence may CC-03 extend a paid subscription period.
10. Reconcile provider settlement batches against internal allocations and surface unmatched, duplicated, delayed and reversed amounts.

## Planned increments

- **CC04.01 — Contracts and ledger model:** immutable invoice snapshots, payment attempts, verified settlement evidence, allocations, reversal model, reconciliation contracts, tenant/founder authority and idempotency.
- **CC04.02 — Durable persistence:** tenant-scoped tables, foreign keys, currency/amount constraints, append-only evidence, RLS/grants, atomic allocation and reversal RPCs.
- **CC04.03 — Invoice engine:** create from approved CC-02 price resolution only; issue/number/void/credit-note workflows.
- **CC04.04 — Provider-neutral collections:** provider account configuration, payment initiation, notification inbox and server-side provider query adapter; Pesapal is an adapter, not the billing domain.
- **CC04.05 — Settlement allocation and reconciliation:** exact amount/currency matching, partial payment, duplicate idempotency, overpayment rejection, refunds/reversals, settlement batch matching and discrepancy queue.
- **CC04.06 — CC-03 lifecycle bridge:** settlement-confirmed evidence contract; renewal period extension only after successful collection and explicit CC-03 authorization.
- **CC04.07 — Security, UAT and release certification:** founder/tenant isolation, concurrency, provider sandbox, TZS/USD regression, reconciliation, CI and explicit production release gate.

## Current implementation increment

The initial TypeScript contracts and tests define invoice line totals, immutable issued invoice snapshots, tenant-bound payment attempts, provider notifications as evidence only, server-provider-query verified settlements, exact currency/amount reconciliation, idempotent allocation keys, partial allocation and overpayment rejection.

The contract layer does not issue invoices, contact Pesapal, mark subscriptions active, mutate production records or perform a payment. Database persistence and transactional RPCs remain the next increment. CC-02 published pricing and the CC-03 merge/release gate remain upstream dependencies for real invoice issuance and subscription-period extension.

## Release restrictions

No production migration, financial record, provider credential, payment attempt, collection, refund, tenant role, subscription period or booking payment has been changed. No production deployment or provider activation is authorized by this workstream.
