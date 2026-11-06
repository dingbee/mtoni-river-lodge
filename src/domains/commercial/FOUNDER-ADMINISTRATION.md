# CC02.05 — Founder Administration

This milestone defines the founder-side commercial administration authorization contract and audit evidence shape.

## Authority boundary

- Nolmark CDMA is the commercial owner.
- Global commercial administration is restricted to a verified `founder_admin` identity in the configured Nolmark CDMA founder tenant.
- Tenant administrators, tenant staff and service principals cannot administer the global catalogue, pricing, package composition, trial policy, commercial accounts or global audit log.
- Tenant ownership or tenant-admin role does not imply founder authority.
- The founder tenant identifier is configuration supplied by a trusted server-side authority source; it is not hardcoded into the policy.
- The actor context must be constructed from verified server-side authentication and tenant membership. Browser-supplied role or tenant claims must never be trusted.

## Covered actions

The policy enumerates read and mutation actions for catalogue, pricing, package composition, trial policy, commercial accounts and commercial audit evidence. All are founder-only in this global administration contract.

## Audit evidence contract

The event schema captures event/request identifiers, verified actor and tenant references, action, resource type/reference, outcome, timestamp and a reason code. It intentionally excludes credentials, payment secrets and raw personal data.

## Security boundary and exclusions

This is a pure policy evaluator and event contract, not a deployed security boundary. Server handlers must authenticate, resolve trusted membership, call the policy, enforce authorization again at the data boundary, and persist append-only audit evidence. RLS/grants and server-side authorization remain mandatory.

No founder UI, API handler, persistence migration, audit table, role mutation, production write or deployment is included. CC-01 is certified; this milestone deliberately closes the authority policy and audit evidence contracts without claiming deployed enforcement or durable audit persistence.
