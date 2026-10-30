# Deferred Verification Register

## SN-IQ-03 — Database verification

**Status:** Deferred — isolated database environment not currently available  
**Scope:** Verification only; no production database changes are authorized by this entry.

- [ ] Verify property-scoped booking/hold RPC behavior against an isolated Supabase database.
- [ ] Run authenticated-role, two-property isolation tests covering cross-property reads and writes under the relevant RLS policies.
- [ ] Record test evidence and close only after both properties are exercised with distinct tenant/property identities.

**Constraints:** Do not use production as a test environment. Do not claim database-level tenant isolation from static SQL review or application-level tests alone. Resume when an isolated DB environment and approved migration/test path are available.
