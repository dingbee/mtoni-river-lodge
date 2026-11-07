# CC-04 — Commercial Billing, Invoicing, Collections and Reconciliation

Baseline: CC-03 merged to main at 22f92ffbe61c995ffbb38ce744054313611570c4.
Branch: feat/cc-04-billing-collections-merged-cc03

## Domain separation
CC-04 is the StayNas subscription-finance ledger. It is not the hospitality booking payment system. It does not write bookings, guest folios, booking payment events or booking settlement RPCs.

## Financial invariants
- Invoice, payment attempt, successful collection, allocation, reversal and entitlement are separate records/lifecycles.
- All amounts are PostgreSQL NUMERIC(20,0) integer minor units. Currency is explicit TZS or USD on each financial record. No FX or currency fallback.
- Invoice issue snapshots and invoice lines are immutable after issue. Corrections use credit/debit notes or controlled voiding.
- Payment callbacks are untrusted notifications. Only a server-side provider query or authorized manual/bank-statement verification may confirm a collection.
- Allocation is transactional, row-locked and idempotent; it cannot exceed invoice outstanding balance.
- Reversals are compensating records; original allocation evidence is retained.
- Provider credentials are not stored in the database. Provider accounts store only a server-side secret reference.
- Tax and discount snapshots require explicit policy references. No tax rate or treatment is inferred.
- CC-04 settlement evidence does not itself extend a subscription period. CC-03 remains the only subscription lifecycle authority.

## Pricing and tax gates
Invoice creation reads the accepted immutable CC-03 subscription price snapshot. It requires an exact currency match and a non-empty line-item array whose sum matches the accepted total. Quote-required Enterprise subscriptions cannot be invoiced until an explicit accepted fixed-value agreement exists. An explicit tax snapshot is required; no rate is invented. No active tax policy or price snapshot means fail closed.

## Persistence delivered
- commercial_invoices and commercial_invoice_lines
- commercial_provider_accounts (tenant scoped; secret reference only)
- commercial_payment_transactions and commercial_payment_allocations
- commercial_payment_reversals
- commercial_invoice_adjustments (credit/debit/write-off evidence)
- commercial_provider_notifications
- commercial_reconciliation_runs and commercial_reconciliation_items
- commercial_financial_audit_events
- receivables view and atomic invoice/payment/reversal RPCs

## Remaining implementation increments
Server handlers and provider adapters must be connected to these database contracts. Pesapal commercial collections must use tenant-scoped provider configuration and must not reuse hospitality booking payment tables or credentials. Email notifications and PDF/receipt delivery must be tenant-authorized. Provider sandbox and concurrency UAT are separate pre-release checks.

## Release
This migration is additive and tested only in isolated PostgreSQL. It has not been applied to production. No payment credentials, real provider calls, production financial records, memberships, roles, subscription statuses, or deployment were changed.
