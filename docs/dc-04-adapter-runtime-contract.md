# StayNas DC-04 — Provider-Neutral Adapter Runtime

Status: DC-04.3 lifecycle/error/health contracts implemented; CI verification pending for the current branch head. No provider connection, credential write, database migration, or deployment is authorised by this artifact.

## Objective

Establish the provider-neutral runtime boundary through which StayNas can register, validate, invoke, observe, and retire external distribution adapters without making any provider mandatory.

StayNas remains the system of record for property inventory, internal rate plans, reservations, and booking lifecycle. Adapters translate between external provider contracts and StayNas canonical contracts; they do not become an independent inventory or reservation authority.

## Scope

1. Adapter registry and provider identity.
2. Capability contracts and capability negotiation.
3. Adapter lifecycle and version compatibility.
4. Authentication/credential-reference abstraction.
5. Normalized errors and retry classification.
6. Connection health and capability-level readiness.
7. Contract tests with mock adapters.

## Explicit exclusions

- No Airbnb, Channex, or other provider is compulsory.
- No live or sandbox provider account is created or connected in this phase.
- No credentials or tokens are collected, persisted, rotated, or exposed.
- No live listing, availability, rate, reservation, or webhook synchronization.
- No changes to existing booking, room inventory, pricing, or reservation lifecycle.
- No production database migration, production data/role change, or deployment.
- No provider-specific UI or tenant-facing credential editor.

## Canonical runtime boundaries

### Provider identity

A provider is identified by a stable internal key and adapter implementation version. Display name, logo, commercial availability, and external account metadata are descriptive and must not control authorization.

### Adapter contract

Each adapter declares:
- provider key and adapter semantic version;
- supported capabilities;
- supported authentication modes;
- supported environments (sandbox/live);
- supported StayNas contract versions;
- required configuration metadata (never secret values);
- health-check support and timeout characteristics.

The runtime must validate the declared capability set before an operation is dispatched. An adapter must reject unsupported operations explicitly; it must not silently degrade or pretend success.

### Capability model

Capabilities are independent and explicit. Initial capability identifiers:
- `listing.read`
- `listing.write`
- `room_mapping.read`
- `room_mapping.write`
- `rate_plan.read`
- `rate_plan.write`
- `availability.read`
- `availability.write`
- `reservation.read`
- `reservation.import`
- `reservation.update`
- `reservation.cancel`
- `connection.health`

Declaring a capability does not activate it. Runtime policy, connection state, account grants, property grants, and adapter version compatibility must all be checked for every operation.

### Execution context

Every invocation receives a server-created immutable context containing:
- organisation ID;
- property ID;
- connection ID;
- provider key;
- external account reference;
- environment;
- operation and capability;
- correlation ID;
- adapter version.

The runtime must reload the persisted connection and its grants before execution. Queue payloads, browser inputs, provider payloads, and adapter-supplied context are untrusted. A worker/service-role credential is not evidence of tenant authorization.

### Credential abstraction

The adapter receives a short-lived credential handle or a credential-resolver function scoped to the validated connection. It must never receive a credential reference that it can resolve outside its connection scope.

- Credential values remain in an approved server-side secret store (Supabase Vault or equivalent).
- Database connection metadata stores only a non-secret reference.
- Public configuration is allow-listed and schema-validated.
- Secrets are never returned to the browser or written to logs, traces, errors, queue payloads, or audit payloads.
- Missing, revoked, expired, or wrong-environment credentials fail closed.
- No direct frontend access to Vault.

### Lifecycle

Connection lifecycle states:
- `draft`: metadata exists but is not eligible for operations;
- `pending_validation`: configuration and grants are being checked;
- `connected`: credential and provider handshake have passed;
- `degraded`: connection exists but one or more health/capability checks fail;
- `suspended`: operations blocked by authorised control;
- `revoked`: credentials/grants withdrawn; no new operations;
- `error`: unrecoverable configuration or provider state requiring intervention.

State transitions must be explicit, audited, and actor-attributed. A health probe cannot automatically reactivate a revoked or suspended connection.

### Normalized errors

The adapter boundary returns typed outcomes, not raw provider exceptions:
- `authentication`
- `authorization`
- `configuration`
- `unsupported_capability`
- `rate_limited`
- `timeout`
- `provider_unavailable`
- `invalid_request`
- `conflict`
- `not_found`
- `permanent_provider_error`
- `unknown`

Each error includes retryability, optional retry-after duration, safe operator message, correlation ID, and sanitized provider code. Raw response bodies and secrets are excluded. Retry policy is owned by the future orchestration layer, not embedded as unbounded loops in adapters.

### Health model

Health is tracked per connection and, where possible, per capability:
- last check time;
- last successful check;
- latency;
- health state;
- last normalized error;
- adapter version;
- credential validity result (boolean/status only, never credential material).

Health probes must be bounded and rate-limited. Provider outage must not affect StayNas direct booking, front desk, internal pricing, or inventory operations.

## Existing repository/database observations

- `staynas_property_integrations` exists with `property_id`, `provider`, `purpose`, `enabled`, `environment`, `credential_reference`, and `public_config`.
- It has a unique constraint on `(property_id, provider, purpose)`, a property foreign key, and sandbox/live environment check.
- RLS is enabled but no policies are installed. This currently denies ordinary browser-role access by default; it is not a complete tenant authorization contract.
- The table does not model organisation-owned external accounts, shared account grants, provider capability declarations, adapter version compatibility, connection lifecycle, or health evidence.
- `credential_reference` is a reference field only; this audit does not establish that a safe credential broker or complete Vault lifecycle exists.
- No distribution adapter registry or provider-neutral adapter runtime was found in the repository search.

## Dependencies and implementation gate

The following must be designed and verified before any provider operation can be enabled:
1. Organisation-owned external accounts and explicit property grants (shared account access must not imply automatic access to every property).
2. Connection/property/account ownership invariants and staff/platform authorization.
3. Server-only credential broker with environment separation and audited access.
4. A canonical internal rate-plan identity and explicit room/rate mapping contract.
5. A validated StayNas inventory/reservation operation boundary. The DC-03R booking/hold RPC mismatch and allocation defect remain recorded and must not be bypassed by the adapter runtime.
6. Durable operation evidence and audit correlation before asynchronous provider work is enabled.

DC-04 may define types, pure validation, mock adapters, and contract tests while these dependencies are being resolved. It must not activate provider calls or write live distribution state until the relevant gates pass.

## Acceptance criteria

- Registry rejects duplicate or incompatible adapter registrations deterministically.
- Capability negotiation rejects unsupported operations before adapter invocation.
- Adapter version and StayNas contract compatibility are checked.
- Runtime derives organisation/property/connection context from persisted authorised records, never caller-supplied authority.
- Credential resolver cannot return a secret for another connection, property, organisation, or environment.
- Normalized errors contain no raw secrets or provider response bodies.
- Health checks are bounded and cannot reactivate suspended/revoked connections.
- Mock-adapter contract tests cover success, unsupported capability, invalid credentials, cross-tenant context, timeout, rate limit, provider outage, and incompatible adapter version.
- No live provider operation or booking/inventory side effect occurs in DC-04 contract tests.

### DC-04.3 lifecycle, error and health policy

- `src/domains/distribution/adapters/lifecycle.ts` defines an explicit transition graph with actor attribution, reason and timestamp requirements.
- Suspended connections can only return to validation through an attributed human/platform-admin action; system health workers cannot reactivate them. Revoked connections are terminal.
- Error normalization accepts a typed code and correlation ID, derives retryability and safe operator text from a fixed policy, bounds rate-limit retry hints to 15 minutes, and drops malformed provider codes. Raw provider messages and response bodies are not accepted.
- Health assessment classifies bounded probe results and latency. The assessment is pure: timeout scheduling, concurrency limits and rate limiting remain responsibilities of the future worker/orchestrator and are not claimed as implemented here.
- `lifecycle.test.ts` covers permitted/forbidden transitions, actor attribution, terminal revocation, safe error normalization, retry bounds and health classification.

## Execution sequence

- DC-04.1 — Repository and schema baseline (this document).
- DC-04.2 — Pure adapter and capability contracts with mock registry.
- DC-04.3 — Connection lifecycle and normalized error/health contracts.
- DC-04.4 — Security and tenant-context contract tests.
- DC-04.5 — Readiness review; no provider activation until dependencies are certified.

## DC-04.3 implementation artifacts

- `src/domains/distribution/adapters/lifecycle.ts` — explicit lifecycle transition policy, safe error normalization and bounded health assessment.
- `src/domains/distribution/adapters/lifecycle.test.ts` — lifecycle, error and health policy tests.

## DC-04.2 implementation artifacts

- `src/domains/distribution/adapters/contracts.ts` — provider manifest, capability, environment, lifecycle, execution context, opaque credential handle, normalized error and health contracts.
- `src/domains/distribution/adapters/registry.ts` — in-memory provider/version registry with duplicate, contract-version, capability and environment checks.
- `src/domains/distribution/adapters/registry.test.ts` — mock adapter contract tests for registration, duplicates, version compatibility, capability and environment rejection, and required health implementation.
- `.github/workflows/dc-04-adapter-contracts.yml` — dedicated Vitest, TypeScript and production-build workflow.

The registry is an in-memory code registry only. It is not a connection store, tenant authorization boundary, credential broker, or provider execution engine. No real provider adapter has been registered.

## Verification boundary

The repository/schema baseline and pure contract implementation are recorded. CI workflow and tests are authored but have not yet been observed passing. The existing integration table is not certified as secure for distribution use. No database schema or data was modified. No provider credentials were used. No provider connection, synchronization, or deployment was performed.
