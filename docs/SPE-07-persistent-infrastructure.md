# SPE-07 persistent distribution infrastructure

The additive schema design is in `docs/database/SPE-07-distribution-persistence.sql`.

## Persistence model

- **Tenant/property scope:** StayNas uses the canonical `staynas_organisations` tenant and `staynas_properties` ownership relation. Child records carry both IDs and use composite foreign keys to prevent cross-tenant property assignment.
- **Connections:** one provider account/property connection per property scope, with status, capability snapshot, mapping version and an opaque `credential_secret_ref`. Credential material is deliberately not stored in Postgres or exposed to browser roles.
- **Mappings:** exact external IDs only. Room-type mappings resolve to `room_categories`; rate-plan mappings resolve to `staynas_rate_plans`; a trigger verifies the target belongs to the same property. External and internal mappings are unique per connection and type.
- **Operation ledger:** durable idempotency key, request fingerprint, payload, correlation ID, attempt limits, state, retry schedule, provider references and redacted error fields.
- **Transactional outbox:** operation and outbox event are inserted in one database transaction. Workers claim rows with `FOR UPDATE SKIP LOCKED`, lease tokens and stale-lease recovery. A fencing token prevents an expired worker from acknowledging work reclaimed by another worker.
- **Reservation inbox:** provider event IDs are unique per connection. Replayed IDs with changed payload fingerprints are rejected. The inbox has bounded attempts, lease-based claiming, event sequence metadata, canonical booking reference and manual-review/dead-letter states.

## Authorization and exposure

All five persistence tables have RLS enabled and revoke access from `PUBLIC`, `anon`, and `authenticated`. Only the trusted server `service_role` can access the raw integration records and queue payloads. Connection and mapping creation RPCs require a verified actor ID and independently validate active property membership plus the StayNas owner/manager/admin/reservations role set. The server must derive that actor ID from the verified Supabase session; never accept it from browser-supplied request data.

The server must separately verify provider webhook signatures before calling the inbox RPC. The database inbox function validates connection scope, event shape and replay consistency; it does not claim to verify provider signatures.

## Release and verification boundary

**This SQL is a review artifact, not an applied migration.** The Supabase CLI is not available in the current repository-editing tool session, so the required `supabase migration new spe07_distribution_persistence` step could not be executed. Do not rename this file into `supabase/migrations` by guessing a timestamp. Generate the migration through the CLI, review it against a clean local database, then run RLS, cross-tenant, uniqueness, concurrency, outbox lease, replay, retry/dead-letter and rollback tests.

The inbox is durable and idempotent, but it intentionally does not create or modify canonical bookings. That final handoff must use a SPE-06-compatible server-side writer that preserves the provider-confirmed historical price and does not silently reprice the external commitment. Live ingestion remains disabled until that writer and the outstanding SPE-06 acceptance gates are verified.
