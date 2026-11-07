# CC03.02 — Durable Persistence Design Gate

Status: IMPLEMENTED ON ENGINEERING BRANCH — NOT APPLIED TO PRODUCTION
Branch: feat/cc-03-subscription-lifecycle
Depends on: CC-01 authorization identity scope; CC-02 catalogue, pricing, package composition and trial policy.
Execution: Inspect → Identify → Implement → Test → Verify → Report.

## Purpose
Define the durable persistence boundary for StayNas commercial accounts and subscription lifecycle records. This document is a design gate only. It does not authorize a production schema change, data write, membership/role change, or deployment.

## Ownership boundaries
- CC-02 remains authoritative for plan/version, price resolution, package composition and trial policy.
- CC-03 persists the commercial account ↔ StayNas organisation association, subscription lifecycle state, immutable accepted price/composition snapshot, trial claim, lifecycle events and audit evidence.
- CC-04 owns invoices, receivables, collections, payment attempts, provider webhooks, refunds and reconciliation.
- CC-05 owns runtime entitlement calculation and enforcement.
- Never reuse restaurant_subscriptions; it belongs to the LexiBite/FnB domain.
- Subscription state must not be treated as payment state or entitlement state.

## Live-schema inspection findings (6 November 2026)

Read-only inspection of the StayNas Supabase project hpsryyywolitgeaacpoy confirmed:

- Canonical organisation table: public.staynas_organisations (id, slug, name, status, created_at, updated_at).
- Property-to-organisation link: public.staynas_properties.organisation_id.
- Current membership relation: public.staynas_property_members (property_id, user_id, role, status); no dedicated organisation-membership table was identified in the inspected schema.
- public.staynas_organisations currently has a SELECT policy based on an active membership in at least one property belonging to the organisation.
- public.staynas_platform_admins is a user allow-list, not proof of the SCEF founder-admin authority contract.
- Existing public.is_staynas_founder_ai_admin() checks an owner property role and hardcodes organisation.slug = 'nolmark-cdma'. It is not reusable as the CC-03 commercial founder authority check because SCEF requires a verified founder_admin identity in a configured founder tenant, not a hardcoded slug or generic owner role.
- Existing property access helper is property-scoped. CC-03 must not assume it provides commercial-account or founder authorization.
- Existing public.activity_logs is operational activity logging with staff policies; it is not a substitute for a dedicated append-only commercial audit ledger.
- No CC-03 commercial-account, subscription, trial-claim or subscription-event tables were found in the inspected schema. The production migration ledger contains CC-01 authorization identity scope, but no CC-02 or CC-03 database migration.


- RLS is enabled on staynas_organisations, staynas_properties, staynas_property_members, staynas_platform_admins and activity_logs; FORCE ROW LEVEL SECURITY is not enabled on these inspected tables.
- The inspected tenant-facing grants on organisation/property/member tables are read-only SELECT for authenticated. The existing platform-admin table is also SELECT-only for authenticated; service_role has narrowly varying server-side privileges.
- Existing founder/property helper functions are SECURITY DEFINER. Their current EXECUTE ACLs differ: the founder-AI helper is executable by authenticated and postgres, while the property-access and staff helpers are executable by authenticated, service_role and postgres. This is a reason not to compose new commercial policies around them without a separate security review.
- The public app_role enum currently contains admin, reservations, user, owner, manager, reception, marketing, housekeeping, finance and editor; it does not contain founder_admin. Do not silently map owner/admin to founder_admin or mutate production role assignments. The verified founder_admin principal/tenant mapping must be resolved from the approved CC-01/CC-02 authority source before founder API/RLS integration.
- The existing organisation SELECT policy derives visibility from an active property membership, which gives a useful starting point for tenant reads but does not by itself define subscription mutation authority.

Consequences: the commercial account must reference public.staynas_organisations(id). Tenant read authorization must be designed from the verified organisation → properties → active property-membership relationship and tested against cross-property/cross-organisation cases. Founder authorization requires a separately verified configurable authority source before SQL/RLS implementation. Do not infer it from staynas_platform_admins, is_staynas_founder_ai_admin(), user_roles, or a property owner role.

## Proposed persistence objects
Final table names and foreign keys remain subject to inspection of the exact live schema and CC-01 helper contracts.

1. Commercial account: one account per StayNas organisation (unique organisation reference), status and timestamps. Organisation FK must target the verified canonical StayNas organisation table and key; do not guess table names or IDs. No client-controlled account ownership reassignment.
2. Commercial subscription: account FK; plan code and immutable plan version reference; exact currency (TZS or USD), billing term, property count, add-on codes, price resolution reference, immutable accepted price/composition snapshot; lifecycle state and timestamps; trial/policy and paid-period boundaries; accepted agreement reference; cancellation and suspension evidence. No invoice, payment, provider payload, or entitlement fields.
3. Trial claim: one durable claim per commercial account for the lifetime of that account. Unique constraint on account; never delete/reset on cancellation, expiry or plan change. Claim and trial activation must be atomic/idempotent. Trial is 14 × 24 hours from activation with an exclusive end instant, using CC-02 policy.
4. Subscription lifecycle events: append-only history with subscription/account references, event type, occurrence time, request/idempotency key, verified actor, reason code and minimal metadata. Unique idempotency key scoped to account or subscription. Corrections are compensating events, not edits.
5. Commercial audit evidence: append-only record for founder and tenant actions. Record verified actor/tenant, action, resource, outcome, request reference, timestamp and reason. Exclude credentials, payment secrets, raw provider payloads and unnecessary personal data. Reuse CC-02 audit contract where compatible.

## Database invariants
- A StayNas organisation has at most one commercial account.
- A commercial account can have multiple historical subscriptions, but at most one current non-terminal subscription unless an approved overlap rule is added.
- A commercial account can claim the free trial once, permanently.
- Published plan and price versions are referenced, never rewritten by CC-03.
- Currency is explicit on every accepted snapshot; no implicit FX conversion or fallback.
- Enterprise quote-required snapshots contain no fabricated fixed total or line items and require an accepted agreement reference before paid activation.
- Terminal subscription states cannot be reopened; a new subscription is a new record linked to the same account.
- All state transitions and trial claims must be transactional and idempotent.
- Database constraints must enforce critical invariants; TypeScript validation alone is insufficient.

## Authorization and RLS requirements
- Resolve authenticated user and tenant membership from trusted server-side identity and CC-01 contracts. Never trust browser-supplied organisation IDs, tenant IDs, roles, founder flags, or user metadata.
- Tenant reads are restricted to the tenant's verified organisation/account association.
- Tenant clients receive no direct INSERT/UPDATE/DELETE privilege on commercial accounts, subscriptions, trial claims, lifecycle events or audit evidence. Mutations go through authenticated server handlers with server-side authorization and transactional persistence.
- Global commercial administration is founder-only: verified founder administrator in the configured Nolmark CDMA founder tenant. Tenant-admin status does not imply founder authority.
- No hardcoded founder tenant UUID.
- Enable RLS on every table in an exposed schema. Explicitly grant only minimum required privileges; table exposure and row filtering are separate controls.
- Avoid SECURITY DEFINER functions in exposed schemas. Any privileged internal function must be justified, narrowly scoped, placed in a non-exposed schema, check trusted identity/authorization, have EXECUTE revoked from PUBLIC/anon, and receive explicit least-privilege grants.
- Do not create views over these records unless they use SECURITY INVOKER and have independently verified grants/RLS.
- Index tenant/account/subscription foreign keys and columns used by RLS predicates.

## Required inspection before writing SQL
1. Verify actual Supabase project reference and linked account; do not choose between multiple connected Supabase accounts by guess.
2. Read-only inspect canonical organisation table, primary key, tenant membership relation, tenant isolation helper signatures, founder authorization helper signatures and grants.
3. Inspect CC-01 migration and exact live migration ledger; reconcile repository migration history with production before adding a migration.
4. Inspect CC-02 persistence (if any), plan/version/price reference keys, and audit evidence schema.
5. Confirm PostgreSQL version and exposed-schema/Data API settings. Supabase changed new public-table Data API exposure defaults in 2026; do not assume grants or exposure.
6. Write a local/test migration, validate constraints, RLS, grants and rollback strategy, then run database security/performance advisors and negative cross-tenant tests.
7. Only after those checks, submit the migration for review. Do not apply to production without explicit authorization.

## Acceptance tests
- Organisation A cannot read or mutate Organisation B's account, subscriptions, trial claim, events or audit evidence.
- Tenant administrator cannot invoke founder-only global commercial operations.
- A founder without verified founder-tenant membership is denied.
- Anonymous and unauthenticated requests are denied.
- Authenticated tenant users cannot write directly to protected commercial tables.
- Two concurrent first-trial requests yield exactly one durable trial claim and one activated trial.
- Retried requests with the same idempotency key return the original result without duplicate events.
- Trial cancellation/expiry never releases the one-time trial claim.
- Event and audit rows cannot be updated or deleted by tenant/founder client roles.
- TZS and USD snapshots remain isolated; no currency fallback or conversion.
- CC-04 invoice/payment records and CC-05 entitlement state remain outside CC-03 persistence.

## CC03.02 implementation artifacts

Implementation is present on the engineering branch only. PostgreSQL execution is gated by the ephemeral CI workflow; the live StayNas production database remains unchanged.

- Migration: `20261107090000_cc03_subscription_lifecycle.sql`.
- Database contract tests: `supabase/tests/cc03_subscription_lifecycle.test.sql`.
- Ephemeral PostgreSQL verification workflow: `.github/workflows/cc03-database-verification.yml`.
- Tables are RLS-enabled and FORCE RLS; anon/authenticated receive no direct table privileges. The service role receives only the privileges required by the server-side persistence layer. Trial claims and event/audit history are append-only; accepted price/composition snapshots and organisation association are immutable.
- `commercial_user_has_organisation_access` and `commercial_is_founder_admin` are caller-bound predicates. Founder tenant/principal configuration remains intentionally unseeded and must be provisioned only after independent identity and membership verification.

## Release gate

CC03.02 persistence and the scoped CC03.05 tenant/founder read and trial-activation handlers are implemented on the rebased engineering branch. The PostgreSQL 17 workflow has passed migration application, grants/RLS and tenant/founder predicate regression tests, append-only and immutable-record checks, atomic trial activation, idempotent replay, and the concurrent one-trial test.

The full P1 build/type/lint and cross-domain regression workflows are running against the same rebased commit. Application UAT must use isolated test identities and a server-provisioned CC-02 trial-policy configuration. No production migration, tenant data, founder identity, membership/role or deployment has been changed.