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
| CC-06 Founder workspace | Founder-only commercial portfolio, tenant registry/profiles, subscriptions, billing, policy, entitlements, notifications and audit. | CC-06 merged after nine successful GitHub Actions checks. Existing overview uses JavaScript `Number()` for NUMERIC(20,0) amounts; CC-07 reporting path uses BigInt and string minor units. The legacy overview precision issue remains a remediation item. |

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
| 1 | Invoice total reconciliation | Existing CC-04 ledger tests; CC-07 aggregation verification pending |
| 2 | Partial payment reconciliation | Existing CC-04 ledger tests |
| 3 | Full payment reconciliation | Existing CC-04 ledger tests |
| 4 | Multiple payment allocation | Existing CC-04 ledger tests |
| 5 | Payment reversal | Existing CC-04 ledger tests |
| 6 | Credit-note treatment | Existing CC-04 ledger tests |
| 7 | Unallocated payment detection | Existing CC-04 ledger tests; CC-07 reporting view added |
| 8 | Duplicate provider callback detection | Existing CC-04 idempotency tests |
| 9 | Provider/internal amount mismatch | Existing reconciliation engine tests |
| 10 | Currency mismatch detection | Existing reconciliation engine tests; CC-07 mixed-currency statement guard added |
| 11 | Subscription-to-invoice reconciliation | Pending |
| 12 | MRR calculation | CC-07 founder report implementation; regression pending |
| 13 | ARR calculation | CC-07 founder report implementation; regression pending |
| 14 | New MRR | Pending lifecycle-derived movement implementation |
| 15 | Expansion MRR | Pending lifecycle-derived movement implementation |
| 16 | Contraction MRR | Pending lifecycle-derived movement implementation |
| 17 | Churned MRR | Pending lifecycle-derived movement implementation |
| 18 | Trial exclusion | Report filters to active paid subscriptions; regression pending |
| 19 | TZS and USD isolation | Separate money ledgers/views; regression pending |
| 20 | Receivables aging | Aging view and UI added; boundary tests pending |
| 21 | Entitlement/subscription consistency | Pending |
| 22 | Reconciliation exception lifecycle | Append-only event stream and atomic RPCs added; full lifecycle tests pending |
| 23 | Report export authorization | Founder route guards applied; adversarial export tests pending |
| 24 | Founder-only access | Founder middleware and route guards; adversarial access tests pending |
| 25 | Cross-tenant isolation | Tenant scoping implemented in reporting/reconciliation reads; adversarial isolation tests pending |
| 26 | Historical audit integrity | Append-only evidence protections added; cross-ledger integrity tests pending |
| 27 | Concurrent reconciliation execution | Run row-locking and idempotent provider-period identity added; concurrency test pending |
| 28 | Existing CC-03 regression | Existing CC-03 workflow required |
| 29 | Existing CC-04 settlement regression | Existing CC-04 workflow required |
| 30 | Existing CC-05 entitlement regression | Existing CC-05 workflow required |
| 31 | Existing CC-06 founder workspace regression | Existing CC-06 acceptance and build/test evidence required |
| 32 | SN-IQ-04 omnichannel regression | Existing SN-IQ-04 workflow required |
| 33 | SPE-07 distribution regression | Existing SPE-07 workflow required |

## Remaining acceptance work

1. Add lifecycle-derived new, expansion, contraction, churned and net-new MRR plus ARPT; classify contracted, invoiced, collected, outstanding, one-time, credits and reversals distinctly.
2. Complete subscription-to-invoice and entitlement/subscription reconciliation.
3. Add explicit regression assertions for currency isolation, aging boundaries, trial exclusion, export authorization, founder-only access, tenant isolation, historical audit integrity and concurrent run execution.
4. Run all 33 categories and required CI workflows on one final PR head; remediate all failures.
5. Review performance/pagination on founder workspace and reconciliation history; resolve the legacy CC-06 numeric precision issue.
6. Submit for review only. Production migrations, production data writes and deployments remain prohibited until explicit release authorization.
