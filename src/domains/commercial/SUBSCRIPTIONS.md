# CC-03 — Subscription Lifecycle

Status: IN PROGRESS — CC03.04 implementation submitted for verification  
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

## Implemented milestone details

- **CC03.01 — Implemented:** typed commercial account/subscription lifecycle contracts and deterministic transition regression tests.
- **CC03.02 — Implemented and PostgreSQL-verified on the engineering branch:** durable commercial account, subscription, permanent trial-claim, lifecycle-event, audit and founder-authority persistence; RLS/grants; immutable accepted snapshots; database lifecycle transition guard; exact 336-hour trial claim requirement; tenant/founder caller-bound predicates.
- **CC03.03 — Implemented and PostgreSQL-verified:** service-role-only `commercial_activate_trial` transaction. It locks the commercial account, prevents a second trial, activates the pending subscription, creates the permanent claim, appends the lifecycle event and audit record, and returns the original activation window on idempotent replay. Trial duration is exactly 336 hours with an exclusive end boundary.
- **CC03.05 — Server handlers implemented:** tenant subscription listing and one-time trial activation derive the actor from a verified Supabase Auth user, selected active property, active membership and active organisation. The handler uses the caller-bound organisation predicate, scopes service-role reads to that organisation, derives actor role server-side, resolves the CC-02 policy from server-only configuration, and persists success/denial/failure audit evidence. Founder account listing requires the dedicated caller-bound founder predicate, configured founder organisation and active property membership. No browser-supplied actor IDs, roles, policy versions or tenant IDs are accepted.
- **CC03.06 — Automated verification passed on the current rebased commit:** PostgreSQL 17 migration application, RLS/grant checks, tenant/founder authorization predicates, immutable/append-only history, lifecycle constraints, one-time trial activation, idempotent replay and concurrent activation tests all pass. P1 build, production-build generation, TypeScript, changed-file lint, the shared/finance/Pesapal regression suite, the isolated identity/founder resolver UAT suite and the SN-IQ-04 omnichannel regression workflow all pass. No production database or membership state was changed.

### Required server configuration

Trial activation fails closed unless `STAYNAS_COMMERCIAL_TRIAL_POLICIES_JSON` contains the authoritative CC-02 policy records. Each record must match the CC-02 policy contract, including plan code/version, policy version, enabled state, 14-day duration, activation trigger and effective dates. This variable is server-only and must be provisioned by the commercial policy owner before trial activation is enabled. No policy version can be supplied by the browser.

### Scope boundary

CC03.04 paid activation, plan changes, suspension/reinstatement, cancellation and renewal authorization remain a separate lifecycle-administration increment. CC-04 payment processing and CC-05 entitlement enforcement remain excluded from CC-03. Production remains unchanged; no migration, founder bootstrap, role/membership mutation or deployment has been performed.

## Explicit exclusions

No invoice generation, payment collection, provider integration, refunds, tax calculation, payment-status mutation, entitlement grant/revocation, plan/module inclusion assumptions, commercial price invention, tenant role changes, production data writes or production deployment are part of CC03.01. No migration is applied to the live Supabase project as part of this initial contract milestone.

## Release gate

CC-03 remains unpromoted until all milestones are verified, required CI and security checks pass, migrations are reconciled, UAT evidence is complete and production deployment is explicitly authorized. The separate CC-01/CC-02 production deployment hold remains in force.
