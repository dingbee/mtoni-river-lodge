# SPE-08.01 — First Distribution Provider Selection

**Decision:** Select Channex as the first provider adapter target for SPE-08.
**Decision class:** Technical implementation selection only.
**Status:** Selected for implementation; staging onboarding and production certification remain outstanding.
**Decision date:** 8 November 2026.
**Release state:** Disabled. No provider connection, credential, activation, live ingestion or production change is authorized by this decision.

## Rationale

The existing SPE-07 architecture is provider-neutral and has no operational provider adapter. Channex is selected as the first adapter target because its published PMS integration surface directly covers the required initial distribution path:

- Outbound room-type availability and rate-plan rates/restrictions.
- Booking Revision Feed for new, modified and cancelled reservations.
- Booking revision acknowledgement after durable receipt.
- Webhook notifications that can wake the revision puller.
- A documented staging API and explicit PMS certification process.

This is a technical sequencing decision, not a commercial endorsement or a claim that Channex is the only viable provider. Commercial terms, partner onboarding, staging account access and test-channel availability must be confirmed separately before physical provider acceptance.

## Verified provider constraints

1. API authentication uses the `user-api-key` request header. The key must only be resolved server-side from an approved secret broker; it must never be stored in browser-visible data, request payloads, logs or source control.
2. Availability updates use `POST /api/v1/availability`; rates and restrictions use `POST /api/v1/restrictions`.
3. Current published per-property limits are 10 availability requests/minute and 10 restrictions/price requests/minute. These are separate property-scoped counters; shared account/API-key limits also apply. The adapter must parse rate-limit headers and handle HTTP 429/Retry-After.
4. Booking Revision Feed is the primary inbound source. A revision disappears from the feed after acknowledgement. StayNas must persist and deduplicate the full normalized event durably before acknowledging it.
5. Webhook requests can use HMAC-SHA256 signatures. Verification must use the exact raw request bytes, timestamp tolerance, constant-time comparison and replay protection. Webhooks are wake-up signals; the feed remains authoritative.
6. Booking revisions may contain multiple rooms, taxes, services, commissions and OTA payment-collection metadata. Multi-room allocations must not be flattened. OTA collection status is not proof of a settled StayNas payment.
7. Channex certification is a PMS UI-driven acceptance process. It requires real StayNas user actions to emit ARI updates; standalone scripts that call Channex do not constitute certification.

## Implementation scope

### SPE-08.02 — Adapter and outbound ARI

- Implement a server-only Channex HTTP client with staging/production base URL allow-listing, timeout, response validation and redacted errors.
- Resolve credentials only through the approved server-side secret broker.
- Validate account/property identity before dispatch.
- Convert StayNas integer minor-unit amounts to Channex decimal amounts using explicit ISO currency exponent handling; never assume all currencies have two decimals.
- Resolve exact room-type and rate-plan mappings within tenant/property/connection scope.
- Batch availability separately from rates/restrictions; enforce separate per-property rate limiters and account-level back-pressure.
- Preserve ordering and source-version monotonicity; coalesce superseded unsent ARI updates without discarding the newest state.
- Treat Channex task IDs and warnings as provider acknowledgements/partial results, not as proof that every value was applied.

### SPE-08.03 — Inbound booking revisions

- Poll the Booking Revision Feed with pagination and a durable cursor/lease strategy.
- Normalize new, modified and cancelled revisions, including every room allocation, dates, occupancy, room/rate IDs, daily amounts, taxes, services, commission and payment collection metadata.
- Persist the complete raw provider revision and normalized event before acknowledgement.
- Acknowledge each revision only after durable inbox persistence succeeds.
- Use signed webhooks only to trigger feed polling; verify raw-body HMAC, timestamp and replay window.
- Keep polling fallback active even when webhooks are configured.
- Send unmapped room/rate plans, unknown versions, incomplete financial snapshots and unsupported cases to manual review.

### SPE-08.04 — Acceptance

- Contract/unit tests for mapping, money conversion, batching, rate limits, retry, ordering, partial success, redaction, webhook signature and feed acknowledgement.
- Staging E2E for connection validation, property mapping, ARI changes, new booking, modification, cancellation and multi-room reservation.
- Duplicate, out-of-order, replay, 429, 5xx, timeout, partial response and cross-tenant/property isolation tests.
- Provider certification performed through real StayNas UI workflows.
- Credential vault/encryption/rotation physical configuration test.
- Live inbound remains disabled until SPE-06 acceptance is closed and the canonical reservation path has passed end-to-end acceptance.

## Explicit non-goals for the first adapter

- OTA listing creation/content management.
- PMS-originated OTA booking modifications through the provider's experimental CRS API.
- Card-data ingestion or storage.
- Treating OTA-collected payment as a settled StayNas payment.
- Automatic provider activation or production deployment.

## Upstream dependency

SPE-06 PR #167 remains open and unmerged. Its authenticated browser UAT, last-room concurrency test, modification/repricing workflow and Pesapal callback/invoice reconciliation remain prerequisites for live inbound booking activation. SPE-08 may build and test the adapter in isolation, but it must not bypass these gates.

## Documentation references

- API reference: https://docs.channex.io/api-v.1-documentation/api-reference
- Availability and rates: https://docs.channex.io/api-v.1-documentation/ari
- Booking revisions/feed and acknowledgement: https://docs.channex.io/api-v.1-documentation/bookings-collection
- Webhook HMAC: https://docs.channex.io/api-v.1-documentation/webhook-collection
- Rate limits: https://docs.channex.io/api-v.1-documentation/rate-limits
- PMS certification: https://docs.channex.io/api-v.1-documentation/pms-certification-tests

## Acceptance statement

Channex is selected as the first adapter implementation target. This does not certify the integration, activate a provider, approve commercial terms, authorize credential provisioning, or permit live OTA traffic. Those remain separate, evidenced gates.
