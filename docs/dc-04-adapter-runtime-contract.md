# StayNas DC-04 — Provider-Neutral Adapter Runtime

Status: DC-04.1–04.4 contract implementation complete; DC-04.5 readiness review BLOCKED pending platform prerequisites and current-head CI. No provider activation is permitted. No provider connection, credential write, database migration, or deployment is authorised by this artifact.

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

### DC-04.4 tenant-context authorization policy

- `authorization.ts` builds the immutable adapter execution context from trusted persisted connection, property membership and external-account grant records.
- It fails closed for inactive principals, unusable connection states, missing credential references, provider/version mismatch, environment mismatch, undeclared capabilities, cross-organisation/property membership and mismatched or inactive external-account grants.
- Platform-admin membership bypass does not bypass connection ownership, environment, capability or external-account/property grant checks.
- The resulting context contains identifiers only; it does not expose the credential reference or secret.
- `authorization.test.ts` covers valid resolution, inactive principals, cross-tenant membership, wrong-property grants, environment mismatch, suspended connections, missing credential references and platform-admin boundaries.
- This is a pure policy boundary. It does not yet load database records, enforce database RLS, resolve credentials, or prove that any caller is authorized to supply the records. Those responsibilities remain for a server-side integration and security review.

### DC-04.5 readiness review

**Decision: NOT READY for provider activation.** The provider-neutral contract layer is implemented, but the operational trust and durability boundaries are not certified.

| Gate | Finding | Status |
|---|---|---|
| Adapter manifest, registry and capability contracts | Pure code registry and mock tests added | Implemented; CI pending |
| Lifecycle, safe errors and health assessment | Pure policy and tests added; no worker or persisted health evidence | Partial |
| Tenant execution context | Pure fail-closed policy; no trusted database loader or RLS-backed resolver | Partial |
| External account ownership and property grants | Existing integration table does not represent these relationships | Blocked |
| Connection persistence and lifecycle audit | Existing integration table lacks lifecycle, actor-attributed transitions and audit history | Blocked |
| Credential broker | No verified server-only resolver with connection, tenant and environment isolation | Blocked |
| Rate-plan and room mapping | Canonical distribution mapping contract not certified | Blocked |
| Inventory/reservation boundary | DC-03R RPC mismatch and allocation race remain unresolved | Blocked |
| Durable operation evidence | Distribution operation inbox/outbox and idempotent operation ledger not certified | Blocked |

**Activation rule:** no adapter may perform listing, room/rate mapping, availability, or reservation operations until the blocked gates are implemented and independently verified. In particular, DC-03R must be remediated before any availability or reservation capability is enabled. A service-role credential alone must never authorize tenant scope.

DC-04 is therefore complete as a provider-neutral contract and policy foundation only. It is not a production-ready distribution runtime, and no provider is registered or connected.

## Execution sequence

- DC-04.1 — Repository and schema baseline (this document).
- DC-04.2 — Pure adapter and capability contracts with mock registry.
- DC-04.3 — Connection lifecycle and normalized error/health contracts.
- DC-04.4 — Security and tenant-context contract tests.
- DC-04.5 — Readiness review completed: NOT READY; activation blocked by the gates above.

## DC-04.4 implementation artifacts

- `src/domains/distribution/adapters/authorization.ts` — fail-closed tenant and account grant policy that constructs server execution context.
- `src/domains/distribution/adapters/authorization.test.ts` — cross-tenant, grant, lifecycle, environment and platform-admin boundary tests.

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


### DC-04.6 durable connection persistence contract

**Implementation artifacts added; migration remains unapplied.**

- `20261105140000_dc04_distribution_connection_persistence.sql` defines separate organisation-owned external accounts, explicit property account grants, property-scoped adapter connections and append-only audit events.
- Composite foreign keys bind property, organisation, external account, provider and environment together. A connection cannot point to a grant for a different tenant, account, provider or environment.
- Grants carry an explicit capability allow-list. A connected adapter context is not issued unless the account is connected, the grant is active, and the requested capability is granted.
- Credential storage is represented only by an opaque server-side reference. Raw provider credentials are not represented in the application contract and must be resolved by a later server-only credential broker.
- Browser roles receive no grants and no RLS policies are created for these tables. Service-role access is restricted to trusted server code; service-role use alone is not tenant authorization.
- Audit events are append-only and actor-attributed. The database trigger rejects update/delete, and table privileges also withhold those operations.
- `persistence.ts` validates server-loaded persisted rows and composes them with the DC-04.4 authorization policy. It fails closed on mismatched account/grant/connection scope, environment, lifecycle or capability.
- `persistence.test.ts` covers tenant scope, grant status, capability, environment, malformed records and credential-reference non-disclosure.

**Important boundary:** this step defines the durable schema and pure persisted-record resolver. It does not add a database loader, credential broker, RLS policies for browser access, worker runtime or provider calls. The migration is an artifact only and must not be applied to production or the shared Supabase project. Isolated migration and two-property authorization tests are required before any runtime integration.



### DC-04.7 server-only credential broker

**Implementation artifacts added; migration remains unapplied.**

- External account `credential_reference` is now constrained to a Vault secret UUID, not an arbitrary URI or inline credential.
- `staynas_resolve_distribution_credential` is a SECURITY DEFINER database function with an empty search path. It rejects all callers except the `service_role` and revalidates the exact connection, organisation, property, provider, external-account reference, environment, connected lifecycle and active capability grant before reading Vault.
- The function retrieves the secret by its Vault UUID from `vault.decrypted_secrets`. It never accepts a secret value from the caller.
- Every successful retrieval writes a `credential.accessed` append-only audit event with the connection, property, grant and correlation ID. No secret material is written to the audit event.
- Function execution is revoked from PUBLIC, anon and authenticated; only service_role receives EXECUTE. The app server must still authenticate the initiating user and create a trusted `AdapterExecutionContext` before invoking the broker.
- `credential-broker.server.ts` binds the broker to the server-only Supabase admin client. It returns secret material only to trusted server execution and deliberately replaces database errors with a safe generic error. Do not serialize, log or return its result from route/client functions.
- Contract tests verify exact scope binding, environment binding, malformed/empty response rejection, preflight context validation and safe error handling.

**Security boundary:** service_role bypasses RLS. The SQL function therefore independently verifies the connection/grant tuple and the exact capability. This broker is not a substitute for the preceding user/property authorization policy. It is not yet wired to a live adapter operation; no provider can be called through this milestone.

**Vault operational prerequisite:** before any isolated migration test, confirm Vault is enabled and the migration owner can read `vault.decrypted_secrets`. Supabase documents Vault as encrypted-at-rest secrets exposed through a decrypted view; access to that view must be restricted carefully. See [Supabase Vault documentation](https://supabase.com/docs/guides/database/vault).



### DC-04.8 durable operation, inbox and outbox ledger

**Implementation artifacts added; migration and runtime tests are pending CI verification.**

- `20261105160000_dc04_distribution_operation_ledger.sql` adds a property-scoped operation ledger, append-only attempt evidence, provider webhook inbox and outbound event outbox.
- Operation idempotency is unique per property, connection, operation and idempotency key. Reusing a key with a different request fingerprint is rejected.
- Worker claims use row locking with `SKIP LOCKED`, lease tokens and bounded lease durations. A worker must present the current lease token and identity to complete an operation.
- Retry evidence records attempt number, normalized error, safe summary, response code, duration and correlation ID. Raw provider response bodies and credentials are not stored in attempt evidence.
- Webhook ingestion is deduplicated by provider, external account and provider event ID. Reuse of an event ID with a different payload fingerprint is rejected.
- Browser roles receive no table grants or policies. The service role is the only runtime principal for the ledger tables and RPCs.
- `operation-ledger.server.ts` exposes server-only enqueue, claim, finish and verified-webhook persistence calls. It rejects credential and guest contact fields from durable operation payloads and hashes canonical JSON for request identity.

**Execution boundary:** the ledger is durable infrastructure, not an active worker or synchronization engine. No provider is registered or connected. Workers must re-load and re-authorize the persisted connection before executing every claimed operation; a service-role queue claim is not tenant authorization. Provider webhook signature verification and normalization must happen before calling the inbox writer.

### DC-04.9 trusted server execution-context loader

- `execution-context.server.ts` verifies the supplied access token with Supabase Auth, then loads the connection, grant, external account, property and all active property memberships using the server-only Supabase admin client.
- Tenant role authority is derived from persisted property membership. Browser-supplied property, organisation, grant, account or adapter manifest objects are not accepted as trusted records.
- The adapter manifest is resolved from the server-owned registry. A provider/version that is not registered fails closed.
- The loader does not infer platform-admin authority from tenant roles. A separate trusted platform-admin authority source is required before any platform-admin membership bypass is enabled.
- Unit tests cover successful context creation, absent property membership and anonymous principal rejection.

**Remaining verification:** the isolated PostgreSQL workflow must pass for all three migrations and the end-to-end database contract. The shared Supabase project has been inspected read-only: the Vault decrypted view exists, service_role can select it, and anon/authenticated cannot. No distribution tables or DC-04 migrations have been installed in that shared project.


### DC-04.10 durable outbox dispatch boundary

**Implementation added; isolated migration and CI verification pending.**

- `20261105170000_dc04_distribution_outbox_dispatch.sql` adds service-role-only RPCs for idempotent event enqueue, atomic `SKIP LOCKED` claims, lease ownership and completion.
- Outbox event keys are unique per property. Reuse with a different event type, operation reference or payload is rejected.
- Claims use bounded leases and attempt budgets. Expired leases can be reclaimed; exhausted events are terminally failed.
- `outbox.server.ts` exposes server-only enqueue, claim and finish functions plus an injected internal publisher boundary.
- Publisher failures are recorded with a safe summary and bounded retry delay. Raw exception messages are not persisted.
- The publisher boundary does not invoke a distribution provider and cannot synchronize availability, inventory or reservations. It only dispatches already persisted internal events.
- The isolated PostgreSQL workflow now applies the outbox migration and verifies idempotency, conflicting event reuse, atomic claim and lease completion.

**Verification boundary:** no worker schedule, provider publisher, production migration or live event delivery is enabled. A service-role claim is not authorization to perform a tenant operation; any future worker that invokes a provider must reload the connection and reauthorize the persisted tenant/property grant before execution.
