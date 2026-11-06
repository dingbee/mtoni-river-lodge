# CC-03 — Subscription Lifecycle

Status: IN PROGRESS  
Baseline: SCEF v1.0  
Base: `main` after CC-01 and CC-02 integration  
Execution: Inspect → Identify → Implement → Test → Verify → Report

## Domain ownership

CC-03 owns the customer commercial subscription lifecycle and the association between a StayNas organisation and its commercial account. It does not own plan catalogue, pricing, invoice/collection, payment, or runtime entitlement enforcement.

- CC-02 remains the source of truth for plan identity/version, pricing resolution, package composition and the 14-day trial policy.
- CC-03 owns commercial-account association, subscription activation, trial instance lifecycle, paid activation, suspension/reinstatement, cancellation, expiry, renewal authorization and subscription history.
- CC-04 owns invoices, receivables, collections, payment attempts, payment-provider webhooks, refunds and payment reconciliation.
- CC-05 owns runtime entitlement calculation and enforcement. CC-03 state changes do not directly grant or revoke application modules.
- A subscription is not an invoice or payment. A subscription is not an entitlement.
- Existing `restaurant_subscriptions` belong to the LexiBite/restaurant domain and must not be reused for StayNas commercial subscriptions.

## SCEF v1.0 invariants

- Plans are Essential, Professional and Enterprise only.
- Monthly and annual terms; TZS and USD are exact, isolated currencies. No FX fallback or implicit conversion.
- Hybrid property pricing and independently purchased add-ons are resolved by CC-02. CC-03 stores the immutable accepted price/composition snapshot and does not recalculate prices.
- Trials are exactly 14 × 24 hours from subscription activation, with an exclusive end instant.
- Enterprise quote-required subscriptions require an explicit accepted commercial agreement reference; no public amount or property allowance is fabricated.
- Nolmark CDMA owns global commercial administration. Only a verified founder administrator in the configured Nolmark founder tenant may create or mutate global commercial records.
- Tenant-side subscription actions must be scoped to the tenant's verified StayNas organisation and authorized server-side.
- Billing and payment status are never inferred from subscription status; payment events cannot be browser-authored.
- Subscription history and lifecycle audit evidence are append-only. Published plan/price versions are referenced, not rewritten.

## Planned milestones

1. **CC03.01 — Commercial account and subscription contract:** organisation linkage, immutable plan/price snapshot references, lifecycle states, invariants and deterministic transition tests.
2. **CC03.02 — Durable persistence:** migration for commercial accounts, subscriptions, lifecycle events and audit evidence; tenant isolation, constraints, indexes, RLS and least-privilege grants.
3. **CC03.03 — Activation and trial lifecycle:** one-trial-per-commercial-account enforcement, idempotent activation, exact 14-day trial window and expiry transitions.
4. **CC03.04 — Subscription administration:** paid activation, approved plan changes, suspension/reinstatement, cancellation and renewal authorization. No payment processing.
5. **CC03.05 — API and audit integration:** authenticated server handlers, trusted tenant resolution, founder-only global controls and append-only event evidence.
6. **CC03.06 — Verification and release gate:** migration reconciliation, cross-tenant negative tests, transition/idempotency tests, security review, CI, UAT evidence and release report.

## Explicit exclusions

No invoice generation, payment collection, provider integration, refunds, tax calculation, payment-status mutation, entitlement grant/revocation, plan/module inclusion assumptions, commercial price invention, tenant role changes, production data writes or production deployment are part of CC03.01. No migration is applied to the live Supabase project as part of this initial contract milestone.

## Release gate

CC-03 remains unpromoted until all milestones are verified, required CI and security checks pass, migrations are reconciled, UAT evidence is complete and production deployment is explicitly authorized. The separate CC-01/CC-02 production deployment hold remains in force.
