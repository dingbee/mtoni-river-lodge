# StayNas DC-04.13 — Security and application-contract review

Date: 2026-11-05
Scope: DC-04 adapter runtime branch, migrations 20261105140000–20261106010000, credential broker, execution-context loader, operation ledger, outbox and health-evidence writer.

## Review method and limits

This is an adversarial internal code review with migration-level PostgreSQL 17 verification. It is not represented as an independent third-party security approval. No production database writes, migration applications, deployments, credential creation or provider calls were performed.

## Findings and remediation

1. **Migration version collision — corrected.** The first health-evidence migration timestamp collided with SPE-02's `20261105190000_spe02_fix_priced_availability_room_scope.sql`. The DC-04 migration was moved to `20261106010000_dc04_distribution_health_evidence.sql`, and the workflow path was updated. This must remain after SPE-03/SPE-02 migration ordering in the coordinated release.
2. **Untrusted adapter diagnostics — corrected.** The health writer no longer persists an adapter-supplied message directly. It derives safe text and provider codes through the fixed `normalizeAdapterError` policy and rejects correlation mismatch.
3. **Tenant/property authority — guarded.** The server execution loader verifies the Auth access token, active property and organisation, active membership and explicit account grant. It does not grant platform-admin bypass from tenant roles. The database credential broker independently rechecks connection, organisation, property, provider, environment, active grant, capability and connected lifecycle.
4. **Secret boundary — guarded.** Credential resolution is service-role-only; secret values are not placed in execution context, operation/outbox payloads, health evidence or audit details. Browser roles have no distribution table privileges.
5. **Health evidence integrity — guarded.** Health records are append-only, use a composite connection/organisation/property foreign key, and the writer RPC rechecks active grant and capability. Browser roles cannot read/write; service_role can read/insert only.
6. **Operation/outbox leases — previously remediated.** Completion requires the current unexpired lease token/owner; exhausted retries are terminalized with durable evidence.

## Required independent sign-off

- Formal independent reviewer approval remains outstanding. The available GitHub PR review list contains no submitted approval.
- DC-04.12 persistence remains blocked until SPE-03 exposes the canonical RatePlan and RatePlanAssignment tables and migration order is reconciled.
- Full current-head CI must pass after the migration rename and health writer sanitization.

## Production-readiness blockers confirmed outside this branch

- DC-03R migration is not applied to production; read-only inspection still finds anonymous execution on legacy property-first hold and availability RPCs and both property resolver overloads.
- Production Vercel lacks `PUBLIC_BASE_URL`; booking hostname resolution is not configured for production.
- The live production Supabase schema has no DC-04 distribution tables and no canonical SPE-03 rate-plan tables.
- Existing Supabase security advisor findings require scoped remediation; they must not be bulk-dismissed or mass-changed as part of this release.
