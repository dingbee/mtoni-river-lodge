# CC-07 — Baseline audit and regression register

Baseline commit: `b47bc91ce7020ea3d20760b7d807ab4ce3a981c0` (CC-06 merge)
Implementation PR: #213
Status: IN PROGRESS — UAT/review only; no production promotion.

## CC-02–CC-06 baseline audit

| Workstream | Existing authoritative contract | CC-07 finding / disposition |
|---|---|---|
| CC-02 Commercial policy | Versioned founder-managed policy configuration; immutable versions; current published pointer; policy writes verify founder authority and append audit evidence. | Preserve policy snapshots as the source of accepted prices. CC-07 reporting must not recalculate historic invoices from current catalogue prices. |
| CC-03 Subscription lifecycle | One current subscription per account; immutable accepted-price snapshot; durable lifecycle events; permanent one-time 336-hour trial claim; founder-authorized lifecycle administration. | Reporting must exclude trialing subscriptions from paid MRR/ARR and use active paid accepted snapshots only. Subscription-to-invoice reconciliation remains to be certified. |
| CC-04 Financial ledger | Issued invoice snapshots, payment attempts, allocations, reversals, adjustments, provider notifications, receivables, reconciliation runs/items and financial audit evidence. | Found a schema/engine mismatch: the TypeScript engine emits `status_mismatch`, while the CC-04 item constraint omitted it. CC-07 adds the missing allowed classification. |
| CC-05 Entitlements | Founder-authored rules; durable assignments and decisions; RLS/FORCE RLS; append-only rules/decisions; service-role decision persistence. | Reconciliation must compare current subscription state and effective entitlement state without rewriting historical decisions. Full expiry/revocation consistency regression remains pending. |
| CC-06 Founder workspace | Founder-only commercial portfolio, tenant registry/profiles, subscriptions, billing, policy, entitlements, notifications and audit. | CC-06 merged after nine successful GitHub Actions checks. CC-07 replaces the founder workspace invoice/payment and recurring-value projections with text-backed NUMERIC(20,0) views and BigInt aggregation/formatting. |

## CC-07 implementation currently present

- `commercial_reconciliation_items` accepts `status_mismatch`; lifecycle transitions now serialize with run closure and support review, evidence, escalation, resolution, reopening and idempotent retries.
- Append-only `commercial_reconciliation_item_events` records opening, review, evidence, resolution, reopening and escalation events.
- Service-role RPCs atomically create an exception with its opening event, resolve it with its resolution event, create provider-period runs idempotently, and close runs under a row lock.
- Provider statement reconciliation rejects mixed TZS/USD rows, nets allocation reversals before comparison, and imports a provider statement once per run in one atomic, idempotent transaction.
- Receivables aging view exposes current, 1–30, 31–60, 61–90 and >90-day buckets; founder reporting projections cast every NUMERIC(20,0) amount to text before JavaScript aggregation.
- Revenue fact views separate gross/net invoicing, one-time charges, credit notes, debit notes, write-offs, allocated net collections, payment reversals and unallocated collections.
- Founder reporting query uses stable bounded 500-row pagination and BigInt minor-unit arithmetic; the founder reporting page presents currency-separated MRR/ARR, ARPT, new/expansion/contraction/churned/net-new MRR, invoiced, collected, outstanding, one-time, credits, debits, write-offs, reversals, unallocated and aging totals.
- Founder reconciliation workspace provides idempotent run creation, atomic CSV statement ingestion, review/escalate/resolve/reopen actions, exception history and evidence display. Run completion is serialized with exception writes and can be retried after discrepancies are resolved.
- Summary CSV export and print-to-PDF are available behind founder authorization.

## Required regression matrix (33 categories)

| # | Regression category | Current evidence |
|---:|---|---|
| 1 | Invoice total reconciliation | Existing CC-04 ledger tests; CC-07 gross/net invoice facts and posted adjustment classification added; fixture assertions pending |
| 2 | Partial payment reconciliation | Existing CC-04 ledger tests |
| 3 | Full payment reconciliation | Existing CC-04 ledger tests |
| 4 | Multiple payment allocation | Existing CC-04 ledger tests |
| 5 | Payment reversal | Existing CC-04 ledger tests; CC-07 verified reversal fact and currency-separated report fixture added |
| 6 | Credit-note treatment | Existing CC-04 ledger tests; CC-07 revenue invoice facts assert posted credit-note classification |
| 7 | Unallocated payment detection | Existing CC-04 ledger tests; precision-safe founder projection and unallocated collection view added |
| 8 | Duplicate provider callback detection | Existing CC-04 idempotency tests |
| 9 | Provider/internal amount mismatch | Existing reconciliation engine tests |
| 10 | Currency mismatch detection | Existing reconciliation engine tests; CC-07 mixed-currency statement guard added |
| 11 | Subscription-to-invoice reconciliation | Missing current-period invoice, invoice currency and billing-term consistency view added; fixture assertion added for missing invoice |
| 12 | MRR calculation | Exact text-backed recurring-value view; paid replacement fixture verifies current MRR |
| 13 | ARR calculation | Exact text-backed recurring-value view; monthly ×12 and annual-term fixture assertions included |
| 14 | New MRR | Paid activation event projection; initial activation asserted in replacement fixture |
| 15 | Expansion MRR | Atomic accepted subscription replacement and posted debit-note evidence; fixture asserts +50,000 minor units |
| 16 | Contraction MRR | Replacement fixture verifies -60,000 minor-unit contraction with posted credit-note evidence |
| 17 | Churned MRR | Paid cancellation fixture verifies 90,000 minor units of churn and excludes replaced subscriptions |
| 18 | Trial exclusion | Trialing subscription plus activate_trial event fixture asserts exclusion from MRR and movement facts |
| 19 | TZS and USD isolation | TZS monthly and USD annual fixture asserts separate MRR/ARR with no conversion; cross-currency replacement rejection asserted |
| 20 | Receivables aging | Fixture asserts current and both sides of 30-, 60- and 90-day boundaries |
| 21 | Entitlement/subscription consistency | Drift view and founder workspace exception panel added; cancelled-subscription active-grant fixture asserts detection |
| 22 | Reconciliation exception lifecycle | Append-only review, resolve, reopen and re-resolve fixture assertions added |
| 23 | Report export authorization | Founder route guard and server middleware; adversarial authorization test pending |
| 24 | Founder-only access | Server founder actor resolution and route guards; adversarial access test pending |
| 25 | Cross-tenant isolation | Both founder queries scope customer organisation IDs and exclude founder tenant; adversarial isolation fixture pending |
| 26 | Historical audit integrity | Append-only reconciliation events and subscription movement rows; mutation guard test covers reconciliation evidence |
| 27 | Concurrent reconciliation execution | Run locks, unique provider-period identity, atomic statement import and idempotent replay; concurrent-session test script added to CC-03 database workflow, execution pending |
| 28 | Existing CC-03 regression | Existing CC-03 workflow required |
| 29 | Existing CC-04 settlement regression | Existing CC-04 workflow required |
| 30 | Existing CC-05 entitlement regression | Existing CC-05 workflow required |
| 31 | Existing CC-06 founder workspace regression | Existing CC-06 acceptance and build/test evidence required |
| 32 | SN-IQ-04 omnichannel regression | Existing SN-IQ-04 workflow required |
| 33 | SPE-07 distribution regression | Existing SPE-07 workflow required |

## Remaining acceptance work

1. Revenue movement and financial classifications are implemented. Finish adversarial founder/export authorization and cross-tenant access tests; add entitlement effective-window edge fixtures. The concurrent-session test is now wired into the CC-03 database workflow and awaits CI execution.
2. Subscription-to-invoice and entitlement/subscription drift views and founder exception display are implemented; complete remaining fixture coverage and define the authorized remediation workflow for each exception type.
3. Add explicit regression assertions for currency isolation, aging boundaries, trial exclusion, export authorization, founder-only access, tenant isolation, historical audit integrity and concurrent run execution.
4. Run all 33 categories and required CI workflows on one final PR head; remediate all failures.
5. Complete performance/pagination review for the founder workspace and reconciliation history. Reporting reads use stable 500-row pagination; reconciliation workspace uses bounded history windows.
6. Submit for review only. Production migrations, production data writes and deployments remain prohibited until explicit release authorization.
