# SPE-07 persistent distribution infrastructure

The additive SQL contract is maintained in `docs/database/SPE-07-distribution-persistence.sql`. A server-only TypeScript facade is implemented in `src/domains/distribution/persistence.server.ts`.

## Persistence model

- **Tenant/property scope:** StayNas uses `staynas_organisations` as its canonical tenant and `staynas_properties` for properties. Composite foreign keys ensure every connection, mapping, operation, outbox event and reservation inbox record remains within the same tenant/property boundary.
- **Connections:** provider, external account/property, status, capability snapshot, mapping version and opaque `credential_secret_ref`. Credential material is not stored in Postgres or returned to browser clients.
- **Mappings:** exact external IDs only. Room-type mappings resolve to `room_categories`; rate-plan mappings resolve to `staynas_rate_plans`; a trigger verifies that the internal target belongs to the same property. External and internal mapping uniqueness is enforced per connection and mapping type.
- **Operation ledger:** idempotency key, request fingerprint, payload, correlation ID, attempt limits, status, retry schedule, provider references and redacted error fields.
- **Transactional outbox:** operation and outbox event are inserted in the same database transaction. Workers claim rows with `FOR UPDATE SKIP LOCKED`, lease tokens and stale-lease recovery. A fencing token prevents an expired worker from acknowledging work reclaimed by another worker. Attempts are bounded and exhausted work is dead-lettered.
- **Reservation inbox:** provider event IDs are unique per connection. Replayed IDs with changed payload fingerprints are rejected. The inbox supports event sequencing metadata, bounded attempts, lease-based claiming, canonical booking references and manual-review/dead-letter states.

## Authorization and exposure

All five persistence tables have RLS enabled and revoke access from `PUBLIC`, `anon`, and `authenticated`. Only the trusted server `service_role` can access raw integration records and queue payloads. Connection and mapping creation RPCs independently validate active property membership and the StayNas owner/manager/admin/reservations role set. The server must derive actor IDs from verified Supabase claims; never accept actor identity from browser-supplied JSON.

The server facade uses the repository's existing server-only `supabaseAdmin` client and validates all RPC inputs with Zod. It is not imported by browser modules. Provider webhook signatures must be verified before calling the reservation inbox RPC; database inbox validation is not a substitute for signature verification.

## Migration and CI verification

The SQL remains an additive review artifact in the repository. The SPE-07 workflow now uses the Supabase CLI's `supabase migration new spe07_distribution_persistence` command to generate a migration file in the CI runner, copies the reviewed SQL into that generated file, starts an isolated local Supabase stack, runs `supabase db reset --local`, and executes `supabase test db`. The generated migration is ephemeral in CI; it does not apply to the linked Supabase project or production database.

The pgTAP suite checks table existence, RLS enablement, browser-role access restrictions, composite tenant/property isolation and server-only queue RPC grants. Concurrency, worker lease fencing, duplicate-event replay, mapping uniqueness and retry/dead-letter transition tests remain to be expanded after the migration passes on the isolated database.

## Reservation lifecycle boundary

The inbox intentionally does not create or modify canonical bookings. The final handoff must use a SPE-06-compatible server-side writer that preserves provider-confirmed historical price, tax and fee snapshots and does not silently reprice an external commitment. Live ingestion remains disabled until that writer, event sequencing and the outstanding SPE-06 acceptance gates are verified.

## Release boundary

No linked Supabase project has been selected or modified. No production migration, provider activation, merge or deployment has occurred. The CI database reset targets only the ephemeral local Supabase stack on the GitHub runner.
