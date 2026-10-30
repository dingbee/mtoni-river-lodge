# SN-IQ-03 — Intelligent Booking and Sales
## Baseline audit and execution plan

Branch: `feat/sn-iq-03-intelligent-booking-sales`
Baseline commit: `8b4938252dd131a6ab1a815885b301942bc86681`
Status: audit in progress; no database changes or deployment performed.

## Closure contract
A guest must be able to move from enquiry to a confirmed reservation through the concierge, while preserving property-specific availability, pricing, guest approval, booking holds, and configured payment-provider controls.

## Baseline findings

| Requirement | Existing implementation | Gap / risk |
|---|---|---|
| Real-time property-specific availability | Concierge calls `get_room_availability` with the configured property ID; booking engine also uses this RPC. | Concierge query currently passes dates only; party-size fit is not enforced in the returned availability list. Failure is converted to an empty list, making outages indistinguishable from sold-out results. |
| Accurate currency and rate quotation | Room catalog and availability rows carry currency; booking plan carries currency and total. | The concierge's user-facing prompt and availability context have legacy USD wording/formatting in the existing implementation history; verify every output path uses the returned property's currency and server-calculated total. Never convert currencies implicitly. |
| Room and experience recommendations | Room recommendations are based on capacity and configured room catalog. | Experience catalogue currently returns an empty array; no property-specific experience ranking is implemented. |
| Booking holds and booking-engine integration | Public hold create/release/read server functions exist; `/book` uses holds. Concierge only constructs a prefilled `/book` URL. | Concierge does not create, renew, inspect, or release a hold. Hold creation must be bound to a guest session and active property. |
| Guest-approved reservation creation | Booking engine calls `create_booking` with hold/session identifiers and guest details. | Concierge prompt explicitly tells the model not to complete bookings; there is no structured guest-consent checkpoint or concierge-to-booking handoff contract. |
| Booking confirmation and follow-up | Booking creation sends a best-effort `booking-received` email; booking return/status flows exist. | No verified concierge-originated confirmation/follow-up lifecycle. Email failure must remain visible and retryable without duplicating bookings. |
| Approved payment initiation | `initiatePayment` validates booking reference/email and property ownership, then submits a Pesapal order. | Provider is hard-coded to Pesapal; no verified tenant-configured provider resolution was found in the inspected payment path. Payment initiation is separate from concierge and must only follow explicit guest approval. |

## Hard safety and release gates

1. Do not apply migrations, alter production records/roles, or use production as a test environment.
2. Supabase-dependent booking hold, reservation, RLS and payment-provider integration remain blocked until an isolated Supabase environment and approved migration path are available.
3. No payment request may be created from model inference alone. Require an explicit guest confirmation of the final property, dates, party, room, amount, currency and deposit.
4. Server-side pricing and availability are authoritative. Never trust model-generated totals, client totals, room IDs, provider IDs or payment status.
5. Preserve idempotency for booking creation, payment order submission, notifications and retries.
6. Never claim a reservation is confirmed until the authoritative booking/payment state confirms it.
7. Complete milestone tests, full E2E suite and preview verification before any production promotion.

## Execution sequence

- SN-IQ-03.1: Reconcile concierge, booking-engine, pricing, availability and payment contracts; document authoritative inputs and state transitions.
- SN-IQ-03.2: Implement currency-safe, party-aware quote and property-specific room/experience recommendation logic; add unit/regression tests.
- SN-IQ-03.3: Design and implement consent-bound concierge booking handoff and hold lifecycle behind isolated-Supabase gate.
- SN-IQ-03.4: Implement property-configured payment-provider resolution and explicit payment approval; no provider hard-coding.
- SN-IQ-03.5: Confirmation/follow-up idempotency, observability and recovery paths.
- SN-IQ-03.6: Cross-property runtime, payment sandbox, end-to-end and preview certification.

## Initial disposition

The current concierge is an enquiry, recommendation and booking-link assistant—not yet an end-to-end booking and sales agent. The existing booking engine is a reusable foundation, but the concierge does not currently invoke its hold/create-booking/payment lifecycle. This distinction must remain explicit until the integration is implemented and verified.
