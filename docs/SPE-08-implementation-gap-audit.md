# SPE-08 — Implementation Gap Audit

**Audit date:** 8 November 2026  
**Audited branch:** `feat/spe-08-distribution-provider-acceptance`  
**Audited baseline:** SPE-07 head `84167c69d628ff166f73e2e053881ea23f0bbc91`  
**Disposition:** SPE-08.01 provider decision recorded; provider adapter implementation has not started.

## 1. Baseline integrity

- SPE-08 branch was created exactly at the SPE-07 verified head.
- The SPE-08 branch was 43 commits behind and diverged from `main` at audit time.
- SPE-06 PR #167 and SPE-07 PR #181 remain unmerged stacked dependencies.
- The SPE-08 branch currently contains only the provider decision and SPE-08 CI workflow commits beyond the SPE-07 baseline.
- No rebase, force push, PR retarget, merge, production migration or deployment was performed.

## 2. Existing implementation assets

| Area | Existing code | Finding |
|---|---|---|
| Adapter contract | `src/domains/distribution/provider.ts` | Provider-neutral interface exists; no Channex implementation exists. |
| Capability registry | `src/domains/distribution/registry.ts` | Runtime capability/method consistency is enforced. |
| Outbound dispatch | `src/domains/distribution/engine.ts` | Validates payloads and dispatches rates, availability and restrictions. |
| Outbox worker | `src/domains/distribution/worker.ts` | Lease, retry and dead-letter flow exists; payload batching/provider-specific rate limits are not implemented. |
| Inbound normalization | `src/domains/distribution/inbound.ts` | Generic event fingerprinting/version decisions exist; no Channex revision parser exists. |
| Inbound persistence | `src/domains/distribution/persistence.server.ts` | Durable inbox receive/claim/finish RPC facade exists. |
| Reservation worker | `src/domains/distribution/reservation-worker.ts` | Applies events via canonical writer; provider feed acknowledgement is not wired into this worker. |
| Mapping | `src/domains/distribution/mapping.ts` | Exact tenant/property/connection mapping validation exists. |
| Credential handling | `src/domains/distribution/provider.ts`, `persistence.server.ts` | Opaque credential reference is carried; no verified secret-broker resolver was identified in the inspected distribution implementation. |
| Webhooks | No Channex endpoint identified | Raw-body HMAC verification, replay protection and wake-up handling are not implemented in the inspected distribution domain. |

## 3. Blocking implementation gaps

### P0 — Credential boundary

Implement a server-only credential resolver with an explicit interface and verified backing secret broker. The adapter must receive a resolved API key only in process memory. The API key must never enter browser payloads, database-readable fields, logs, error messages, operation payloads or Git history. Until the broker is selected and tested, connection validation must remain unavailable rather than accepting a placeholder or plaintext credential.

### P0 — Provider request layer

Implement an injectable HTTP client with:
- Explicit staging/production base URL allow-list.
- Timeout and bounded response-body handling.
- `user-api-key` authentication header.
- Safe error normalization and redaction.
- HTTP 401/403 permanent classification, 429 retry with Retry-After, transient 5xx/network timeout retry.
- Provider request/task identifiers and rate-limit response headers.
- No automatic production URL selection or activation.

### P0 — Outbound ARI conversion and dispatch

- Add exact external room/rate mapping resolution before provider calls.
- Convert integer minor units using ISO 4217 currency exponents; do not assume two decimals.
- Build availability and restriction/rate payloads according to Channex's separate endpoints.
- Batch by property and endpoint; apply independent 10 requests/minute/property controls for availability and restrictions/rates, plus account/API-key back-pressure.
- Preserve source-version ordering and coalesce only unsent superseded changes.
- Inspect every per-item warning in successful HTTP 200 responses; partial validation warnings must not be marked fully delivered.

### P0 — Booking Revision Feed and durable acknowledgement

- Implement feed pagination and a durable poller.
- Parse Channex booking revision attributes without discarding raw revision data.
- Map all room allocations independently; unmapped room/rate IDs must go to manual review.
- Preserve room daily amounts, taxes, collected taxes, services, OTA commission and payment collection metadata.
- Persist the complete event to the SPE-07 inbox before calling the Channex acknowledgement endpoint.
- If persistence fails, do not acknowledge. If acknowledgement fails after persistence, retry acknowledgement idempotently without creating a second reservation event.
- Add explicit acknowledgement state to the durable event/poller workflow.

### P0 — Webhook wake-up

- Add raw request body handling before JSON parsing.
- Verify HMAC-SHA256 over `timestamp + "." + raw_body` using constant-time comparison.
- Enforce timestamp tolerance and replay protection.
- Verify provider property/account scope against the exact tenant connection.
- Treat webhook data only as a signal to poll the canonical revision feed; do not apply booking data directly from the webhook.

### P1 — Financial and lifecycle integration

- Preserve OTA amount/currency and all available financial components as an immutable external commitment.
- Do not equate `payment_collect=ota` with a settled StayNas payment.
- Route create, modification and cancellation through the canonical reservation writer only.
- Preserve multi-room allocation identity and amounts.
- Keep live inbound disabled until SPE-06 authenticated UAT, last-room concurrency, modification/repricing and Pesapal reconciliation are accepted.

## 4. CI boundary

Added `.github/workflows/spe-08-provider-acceptance.yml` to run distribution unit contracts, TypeScript, lint, production build and isolated Supabase database contracts on `feat/spe-08-*` pushes and relevant PR changes.

The GitHub connector did not return a GitHub Actions workflow run for the initial SPE-08 commits at the time of this audit. The combined commit status showed a pending Vercel check only. No Vercel deployment was initiated by this work; do not use that pending status as SPE-08 CI evidence. Confirm the Actions run directly before claiming CI verification.

## 5. Next implementation sequence

1. Establish the approved secret-broker interface and prove credential redaction.
2. Implement/test the Channex HTTP client and connection validation against fixtures.
3. Implement outbound ARI conversion, batching, per-property rate limits and partial-success handling.
4. Implement Booking Revision Feed pagination, normalization, durable persistence and acknowledgement.
5. Implement webhook HMAC verification and poller wake-up.
6. Complete multi-room and financial commitment integration.
7. Run clean CI/database verification, then stage E2E with provider-issued credentials.
8. Complete certification through StayNas UI workflows.
9. Close SPE-06 gates before enabling any live inbound reservation flow.

## 6. Release controls

No staging account, provider API key, production credential, provider activation, production migration, production database mutation, merge, Vercel deployment or live OTA traffic is evidenced or authorized by this audit.
