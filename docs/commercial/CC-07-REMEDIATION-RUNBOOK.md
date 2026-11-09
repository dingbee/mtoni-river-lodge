# CC-07 — Founder remediation runbook

This runbook defines the controlled response to reconciliation and cross-domain integrity exceptions. It is not permission to modify production data. All remediation must use the existing founder-authorized commercial workflows and preserve the original ledger evidence.

## Operating rules

1. Confirm the tenant, account, subscription, invoice, provider account and currency before acting.
2. Preserve source evidence: provider statement row, provider transaction reference, invoice snapshot, accepted subscription price snapshot, entitlement decision and audit history.
3. Do not edit or delete historical invoice, payment, allocation, reversal, subscription-event, entitlement-decision or reconciliation-event records.
4. Do not convert between TZS and USD. A currency mismatch is a discrepancy, not an FX instruction.
5. Use posted credit/debit notes only with documented approval and the existing CC-04 adjustment workflow.
6. Record the action, evidence reference, responsible founder and reason. Re-run reconciliation after remediation.
7. Escalate suspected cross-tenant linkage, unauthorized access or unexplained ledger mutation immediately. Do not attempt an in-place repair.

## Reconciliation item types

| Exception | Founder response | Closure evidence |
|---|---|---|
| `missing_internal` | Verify the provider settlement and merchant account. If the payment is legitimate, use the approved payment ingestion/verification workflow. Do not fabricate a payment row. | Provider transaction reference, verified statement row and internal payment ID |
| `missing_provider` | Check provider statement period, pagination and account. Confirm whether the payment was omitted, delayed or settled through another account. | Provider statement reference or documented provider confirmation |
| `duplicate` | Compare provider event/transaction references and idempotency keys. Preserve both source rows; route any duplicate financial posting through the existing reversal/adjustment approval path. | Duplicate reference set and approved corrective ledger reference |
| `amount_mismatch` | Compare the immutable invoice, payment, allocation, provider fee and reversal evidence. Correct only through an approved adjustment or reversal workflow. | Approved adjustment/reversal reference and reconciled provider row |
| `currency_mismatch` | Stop settlement matching for that row. Verify provider account currency and the original contract currency. Never translate TZS to USD or vice versa. | Corrected provider statement or documented provider-account correction |
| `status_mismatch` | Verify the provider's final state and callback history. Apply the existing payment verification/status workflow only after provider evidence is confirmed. | Verified final provider status and transaction reference |
| `unallocated` | Confirm which invoice/account the cash belongs to. Use the existing payment allocation workflow; do not count it as collected invoice revenue until allocated. | Settlement reference and allocation ID |
| `reversed` | Confirm reversal amount, currency and provider reference. Ensure allocation reversals are recorded where allocations existed. | Provider reversal reference and reversal/allocation-reversal IDs |

Use the founder Reconciliation Workspace to move an item through **Open → Under review → Escalated → Resolved**. Resolution requires a durable evidence reference. A run remains in discrepancy state while any item is unresolved, reviewed or escalated.

## Subscription-to-invoice exceptions

| Exception | Founder response |
|---|---|
| `missing_current_period_invoice` | Verify the accepted subscription snapshot and current billing period. Use the existing CC-04 invoice issuance workflow. If invoicing is intentionally deferred, document the reason and owner; do not create a placeholder invoice. |
| `invoice_currency_mismatch` | Stop collection or renewal automation for the affected invoice. Compare the invoice currency with the accepted subscription snapshot. Preserve the invoice; use the approved credit/debit or void-and-reissue process where policy permits. |
| `invoice_billing_term_mismatch` | Compare the invoice billing term and period with the accepted subscription snapshot. Correct only through an approved invoice adjustment or reissue; never rewrite the original snapshot. |

## Entitlement-to-subscription exceptions

| Exception | Founder response |
|---|---|
| `active_entitlement_on_inactive_subscription` | Inspect the subscription terminal event and entitlement grant source. Use the CC-05 founder entitlement administration workflow to record the required revocation/override decision. Do not directly update assignment rows. |
| `active_assignment_outside_effective_window` | Confirm whether the assignment has a future start or expired end. Use the CC-05 entitlement workflow to record a corrected effective decision; retain the original assignment and decision history. |
| `assignment_tenant_mismatch` | Treat as a security incident. Freeze further changes to the affected grant, preserve audit evidence and escalate to the platform founder administrator. Do not edit tenant IDs directly. |

## Approval and evidence checklist

Before resolving any financial or entitlement exception, record:

- Customer tenant and account identifiers
- Affected subscription, invoice, payment or entitlement IDs
- Original currency and amount in exact minor units
- Source statement, provider reference or accepted price snapshot
- Approval/authorization reference where a financial adjustment is involved
- Responsible founder user ID
- Action taken through the authoritative CC-03/CC-04/CC-05 workflow
- Final reconciliation run and item references

A resolved exception records the evidence reference; it does not itself create a financial adjustment, entitlement grant, invoice, payment or provider settlement. All such changes remain separate, explicitly authorized operations.
