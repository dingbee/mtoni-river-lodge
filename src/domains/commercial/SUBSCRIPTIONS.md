# CC-03 — Subscription Lifecycle

Status: CC03.01–03.03 implemented; CC03.04 implementation and automated gates passed on PR #180; review/merge and upstream commercial dependencies remain open.  
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
4. **CC03.04 — Subscription administration:** paid activation, suspension/reinstatement, cancellation, expiry and renewal authorization. Plan changes remain gated on CC-02 published pricing/version contracts. No payment processing.
5. **CC03.05 — API and audit integration:** authenticated server handlers, trusted tenant resolution, founder-only global controls and append-only event evidence.
6. **CC03.06 — Verification and release gate:** migration reconciliation, cross-tenant negative tests, transition/idempotency tests, security review, CI, UAT evidence and release report.

## Implemented milestone details

- **CC03.01 — Implemented:** typed commercial account/subscription lifecycle contracts and deterministic transition regression tests.
- **CC03.02 — Implemented and PostgreSQL-verified on the engineering branch:** durable commercial account, subscription, permanent trial-claim, lifecycle-event, audit and founder-authority persistence; RLS/grants; immutable accepted snapshots; database lifecycle transition guard; exact 336-hour trial claim requirement; tenant/founder caller-bound predicates.
- **CC03.03 — Implemented and PostgreSQL-verified:** service-role-only `commercial_activate_trial` transaction. It locks the commercial account, prevents a second trial, activates the pending subscription, creates the permanent claim, appends the lifecycle event and audit record, and returns the original activation window on idempotent replay. Trial duration is exactly 336 hours with an exclusive end boundary.
- **CC03.04 — Implemented on PR #180; automated gates passed:** service-role-only transactional lifecycle command for paid activation, suspension, reinstatement, tenant end-of-period cancellation request, founder immediate cancellation, system expiry and renewal authorization. Founder and tenant server handlers re-resolve caller authority server-side. Lifecycle and audit events are appended transactionally; idempotent replay is supported and conflicting key reuse is rejected. Renewal authorization records acceptance evidence only and does not extend the billing period before CC-04 settlement. PostgreSQL 17 migration/contract tests, P1 build/typecheck/lint, P1 regression tests and SN-IQ-04 omnichannel contracts all pass. PR review and merge remain pending.
- **CC03.05 — Server handlers implemented:** tenant subscription listing and one-time trial activation derive the actor from a verified Supabase Auth user, selected active property, active membership and active organisation. The handler uses the caller-bound organisation predicate, scopes service-role reads to that organisation, derives actor role server-side, resolves the CC-02 policy from server-only configuration, and persists success/denial/failure audit evidence. Founder account listing requires the dedicated caller-bound founder predicate, configured founder organisation and active property membership. No browser-supplied actor IDs, roles, policy versions or tenant IDs are accepted.
- **CC03.06 — Automated verification evidence:** PostgreSQL 17 migration application, RLS/grant checks, tenant/founder authorization predicates, immutable/append-only history, lifecycle constraints, one-time trial activation, idempotent replay and concurrent activation tests have passed on the engineering branch. P1 build, production-build generation, TypeScript, changed-file lint, the shared/finance/Pesapal regression suite, the isolated identity/founder resolver UAT suite and the SN-IQ-04 omnichannel regression workflow have passed. Final release certification remains gated on review/merge, CC-02 commercial prerequisites, migration reconciliation and explicit production authorization.

### Required server configuration

Trial activation fails closed unless `STAYNAS_COMMERCIAL_TRIAL_POLICIES_JSON` contains the authoritative CC-02 policy records. Each record must match the CC-02 policy contract, including plan code/version, policy version, enabled state, 14-day duration, activation trigger and effective dates. This variable is server-only and must be provisioned by the commercial policy owner before trial activation is enabled. No policy version can be supplied by the browser.

### Scope boundary and outstanding dependencies

- CC-02 must publish the approved plan catalogue, immutable plan/price versions, pricing resolver, package composition and authoritative server-side trial policy before paid onboarding, plan changes or trial activation can be enabled.
- CC-04 payment processing and settlement remain separate. Renewal authorization does not extend a paid period; successful settlement evidence is required before CC-04/CC-03 period extension.
- CC-05 entitlement enforcement remains excluded. CC-03 lifecycle changes do not directly grant or revoke modules.
- Production remains unchanged. No production migration, founder bootstrap, tenant membership/role mutation, payment processing, entitlement write or production deployment has been performed. The Vercel result for PR #180 is a preview deployment only.

## Explicit exclusions

No invoice generation, payment collection, provider integration, refunds, tax calculation, payment-status mutation, entitlement grant/revocation, plan/module inclusion assumptions, commercial price invention, tenant role changes, production data writes or production deployment are part of CC-03. No migration is applied to the live Supabase project as part of this implementation.

## Release gate

CC-03 remains unpromoted until all milestones are verified, required CI and security checks pass, migrations are reconciled, UAT evidence is complete and production deployment is explicitly authorized. PR #180 remains open pending review/merge. The separate CC-01/CC-02 production deployment hold remains in force.
