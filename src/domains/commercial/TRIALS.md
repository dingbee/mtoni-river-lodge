# CC02.04 — Trial Configuration

This milestone defines the commercial trial policy contract. The SCEF Baseline v1.0 fixes trial duration at 14 days.

## Policy contract

- Trial policy is versioned and scoped to an exact plan code and plan version.
- Duration is fixed at 14 calendar-day equivalents (14 × 24 hours); it is not tenant-configurable.
- The trial starts when the subscription is activated, not when a tenant is created or invited.
- The end timestamp is exclusive: access to the trial period ends at the exact instant 14 × 24 hours after activation.
- Policy enablement and effective dates are explicit and validated.
- TZS/USD, monthly/annual billing and package composition remain separate concerns.

## Lifecycle boundary

This milestone calculates a trial window only. It does not:
- create or activate a subscription;
- determine customer eligibility or enforce one-trial-per-tenant rules;
- automatically convert a trial into a paid subscription;
- create invoices, collect payment or charge a payment method;
- grant, revoke or extend runtime entitlements;
- send notifications or schedule expiry jobs.

Those customer-specific lifecycle actions belong to CC-03 subscriptions, CC-04 billing/collections and CC-05 entitlements. No default plan eligibility matrix is inferred.

## Governance and persistence

Commercial policy authoring remains under Nolmark CDMA founder-only authority. Tenant administrators do not gain global commercial authority. The contract is code-only; no database migration, API, founder UI, production write or deployment is included. Durable persistence remains gated on CC-01 certification.
