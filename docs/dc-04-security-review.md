# StayNas DC-04.13 — Final Internal Security Review

Date: 2026-11-05
Scope: DC-04 adapter runtime branch at `911fd2e9ea899b043229408f2824e1d4f58246a3`.

## Review conclusion

**Internal security review: PASS.** The final review examined tenant and property authority, adapter execution context, account-grant binding, Vault credential resolution, service-role-only persistence, durable health evidence, append-only controls, operation/outbox leases, idempotency and durable payload privacy. Identified issues in the reviewed scope were remediated and regression coverage added. No unresolved P0/P1 finding remains within the DC-04 branch scope.

This is an internal engineering review and is not represented as an external third-party certification or independent auditor's attestation.

## Controls verified

1. **Tenant/property authority.** The server execution loader verifies the authenticated principal, active organisation and property, active membership and explicit account grant. Tenant roles do not imply platform-admin authority.
2. **Credential boundary.** Credential resolution is server-side through the Vault broker. Secret values are not added to execution context, operation/outbox payloads or health evidence.
3. **Grant and capability binding.** Connection, external account, organisation, property, provider, environment, adapter version, lifecycle and granted capability are revalidated before execution and health evidence writes.
4. **Health evidence integrity.** Evidence is append-only and composite-scoped to connection, organisation and property. Browser roles have no table privileges; service role is limited to read/insert; update/delete are revoked and rejected by a trigger.
5. **Diagnostic privacy.** Health messages are derived from a fixed normalization policy. Raw provider response bodies and adapter-supplied diagnostic strings are not persisted.
6. **Durable payload privacy.** Operation-ledger and outbox validators reject guest/customer/person/contact fields, common email/phone values, bearer/JWT/payment-secret patterns and oversized free-text values.
7. **Worker integrity.** Operation/outbox completion requires the current unexpired lease token and owner. Exhausted retries are terminalized with durable evidence.
8. **Migration safety.** Health evidence migration version was moved to `20261106010000` to avoid collision with the SPE-02 migration sequence. The migration and security smoke passed in isolated PostgreSQL 17 CI.

## CI evidence

Latest reviewed head `911fd2e9ea899b043229408f2824e1d4f58246a3`: all five required workflows passed — P1 build, P1 tests, adapter contracts, migration/credential isolation and omnichannel contracts.

## Deferred items — not security-review failures

- DC-04.12 persistence remains intentionally held until SPE-03 canonical RatePlan and RatePlanAssignment schema is approved and available.
- Production migration/release sequence remains held by project direction.
- Broader production Supabase legacy RPC grants are tracked in production-readiness scope and are not changed or waived by this DC-04 review.
- No provider activation, channel synchronization, production migration, merge or deployment was performed.

## Sign-off boundary

DC-04.13 internal engineering security review is closed as PASS. Any organisation-mandated external auditor or third-party approval is a separate governance action and is not claimed here.
