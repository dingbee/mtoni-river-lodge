# CC02.06 — API & Commercial Contracts

CC02.06 defines versioned transport contracts for the commercial domain. It does not implement HTTP handlers or expose a live API.

## Contract surface

- Catalogue read and exact plan-version lookup.
- Price resolution using the existing deterministic pricing input contract.
- Package-composition validation using explicit composition and compatibility inputs.
- Trial-policy lookup using an exact plan and plan version.
- Founder administration action requests with enumerated actions, resource references and mandatory reason text.
- Discriminated success/failure envelopes with request correlation and stable error codes.

## Error semantics

The contract standardizes validation, authentication, authorization, not-found, conflict, ambiguous configuration, unavailable price, quote-required, rate-limit and internal-error codes. HTTP handlers must map these codes to appropriate HTTP status codes; this milestone does not prescribe or implement handlers.

## Security and governance

- Founder administration must authenticate the session and resolve tenant membership server-side, then invoke the CC02.05 founder authorization policy.
- Browser-supplied role, tenant, founder status or permission claims are never authoritative.
- Tenant admins/staff and service principals cannot mutate the global commercial catalogue, prices, compositions, trial policies or commercial accounts.
- Mutations must carry a reason and be recorded in append-only audit evidence by a future server-side implementation.
- Credentials, payment secrets and raw personal data are excluded from the transport contracts.

## Domain boundaries

- Catalogue, pricing, package composition, trial configuration and founder authority reuse CC02.01–.05 contracts.
- Subscription lifecycle remains CC-03.
- Invoice and collection lifecycle remains CC-04.
- Runtime entitlement evaluation remains CC-05.
- A quote-required Enterprise result is not a fixed price.
- Subscription ≠ Invoice ≠ Payment; Plan ≠ Entitlement; commercial catalogue ≠ tenant configuration.

## Explicit exclusions

No HTTP route, API handler, persistence migration, database write, UI, subscription lifecycle, invoice, payment, entitlement grant, production deployment or live traffic change is included. Durable persistence and server-side authorization remain gated by CC-01 certification.
