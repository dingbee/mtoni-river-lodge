# SPE-07 — Channex Adapter Evaluation

**Status:** Evaluation candidate only — not selected, connected, certified or enabled.  
**Integration posture:** Provider-neutral StayNas core; provider-specific behavior remains behind an adapter.  
**Evidence reviewed:** Channex public developer documentation and integration guide, 7 November 2026.

## Candidate fit

Channex provides a PMS-oriented REST API and a free staging environment. Its published integration path covers property/room/rate setup, outbound availability/rates/restrictions, inbound booking revisions, and certification. It is a plausible first adapter candidate, but no StayNas account, staging property, API key, commercial agreement or provider certification is evidenced.

## Supported integration surface to evaluate

| Capability | Documented behavior | StayNas adapter posture |
|---|---|---|
| Connection validation | API key authentication; property-scoped API access is available | Implement read-only validation after staging credentials exist |
| Availability | Send availability per room type/date | Candidate for outbound support |
| Rates and restrictions | Send rate/restriction changes by rate plan/date | Candidate for outbound support |
| Reservation ingestion | Booking Revision Feed is the primary PMS path; supports new, modified and cancelled revisions | Candidate for inbound pull |
| Webhooks | Booking webhook triggers a pull of the revision by ID; webhook delivery can be out of order | Use as a wake-up signal only; always pull canonical revision |
| Feed acknowledgement | Acknowledge each revision after it has been durably accepted by the PMS | Acknowledge only after StayNas inbox persistence succeeds |
| PMS-initiated OTA booking edits | Booking CRS API is documented as beta/experimental | Excluded from first release |
| OTA listing creation/content | Not currently supported by Channex's integration guide | Manage in OTA extranet |

## Provider-specific reliability constraints

- Authentication uses the `user-api-key` request header. Credentials must be resolved server-side from a secret broker; never expose them to browser code, logs, or operation payloads.
- ARI changes must be batched. Channex documents a 10 MB request-body ceiling and per-property ARI limits of 20 requests/minute total, split into 10 availability requests and 10 rate/restriction requests.
- Channex processes ARI updates FIFO. StayNas must preserve per-property ordering and coalesce changes instead of sending a request for every individual date/item.
- Use the Booking Revision Feed as the durable source. Webhooks are notifications, not authoritative booking payloads; they may arrive out of order.
- Channex recommends a polling backup every 15–20 minutes even when webhooks are configured.
- A booking revision must not be acknowledged before the durable StayNas inbox has accepted it. Canonical processing can then retry independently of the provider feed.
- Channex requires its PMS certification before production go-live. Certification actions must be demonstrated through StayNas itself, not manual API tools.

## Normalization and financial boundaries

Channex booking revisions expose booking and room amounts, currency, daily room-price details, room-level taxes, services, OTA commission, and payment-collection information. StayNas must preserve those fields as an immutable external commercial commitment. In particular:

- `payment_collect=ota` is not evidence that StayNas has received a payment; do not translate it directly into a settled StayNas payment event.
- Preserve OTA commission separately from property revenue and payment reconciliation.
- Preserve tax inclusivity/type and service line details; do not infer them from a single total.
- Multiple rooms in one OTA reservation require a canonical group/room-allocation strategy. The current inbound contract represents one room type per event and must not silently flatten multi-room revisions.
- Card data is outside the first adapter scope. Channex documents secure endpoints and PCI requirements for card data; StayNas must not request or persist card details until a separate PCI design and authorization exist.

## Release gates specific to Channex

1. Confirm Channex remains the selected first adapter and complete partner/commercial onboarding.
2. Create a staging account, test property, API key and test channel mappings.
3. Obtain and test Booking.com and Airbnb test-channel accounts as appropriate.
4. Complete and test exact room-type/rate-plan mapping.
5. Implement ARI batch conversion, currency-exponent handling, per-property rate limiting, ordering, acknowledgement parsing and partial-success diagnostics.
6. Implement Booking Revision Feed ingestion, webhook wake-up, 15–20 minute polling fallback, deduplication, ordering, durable inbox acknowledgement and manual-review behavior.
7. Complete canonical external-reservation create/modify/cancel persistence without repricing, including multi-room and financial commitment coverage.
8. Pass concurrency, duplicate/replay, out-of-order, rate-limit, partial-success, retry, dead-letter and cross-property isolation tests.
9. Complete Channex certification through the StayNas application and obtain production authorization.
10. Provision the approved credential vault/encryption/rotation path during physical configuration testing.

## Official documentation

- Start Integration: https://channex.io/start-integration
- API Reference: https://docs.channex.io/api-v.1-documentation/api-reference
- Availability and Rates: https://docs.channex.io/api-v.1-documentation/ari
- Bookings Collection: https://docs.channex.io/api-v.1-documentation/bookings-collection
- Webhook Collection: https://docs.channex.io/api-v.1-documentation/webhook-collection
- Rate Limits: https://docs.channex.io/api-v.1-documentation/rate-limits
- PMS Certification Tests: https://docs.channex.io/api-v.1-documentation/pms-certification-tests
- Booking CRS API (beta): https://docs.channex.io/api-v.1-documentation/booking-crs-api

## Decision

Do not register or activate a Channex adapter as production-capable yet. The public documentation supports a concrete implementation path, but the staging account, credentials, provider mappings, canonical external reservation writer, multi-room handling, credential vault, and certification remain unverified.
