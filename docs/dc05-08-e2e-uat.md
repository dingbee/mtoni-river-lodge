# DC-05.08 — End-to-End Verification & Operational UAT

## Objective

Prove that the merged DC-05.03–.07 distribution booking path hands a real channel reservation into property operations and that staff can execute the complete arrival, stay, departure, cleaning and room-readiness lifecycle without duplicating records or fabricating payments.

This workstream is verification and acceptance, not a new distribution infrastructure build.

## Automated gates

| Gate | Automated evidence | Acceptance |
|---|---|---|
| Provider ingestion and canonicalization | DC-05.03/04 PostgreSQL smoke suite | One canonical booking, correct lifecycle, preserved source |
| Provider finance evidence | DC-05.06 finance smoke suite | Evidence remains separate from payment ledger |
| Operational projection | DC-05.07 PostgreSQL smoke suite | One projection, task and date-range allocation |
| Lifecycle/replay | DC-05.07 PostgreSQL smoke suite | Cancellation, reinstatement, replay, unsafe-change reconciliation |
| Physical room check-in | DC-05.07 PostgreSQL smoke suite | Exact allocated physical unit is bound and occupied |
| Checkout handoff | DC-05.07 PostgreSQL smoke suite | Exact unit becomes vacant_dirty and one turnover task is queued |
| Housekeeping execution | DC-05.08 PostgreSQL UAT | Claim, start, complete are role-gated and idempotent |
| Inspection failure | DC-05.08 PostgreSQL UAT | Room remains unavailable and a re-clean task is created |
| Inspection pass | DC-05.08 PostgreSQL UAT | Supervisor pass moves room to vacant_clean with audit evidence |
| Financial integrity | DC-05.08 PostgreSQL UAT | Cleaning does not mutate booking payment status, paid amount or currency |
| Application contract | Reservation ingestion CI | Tests, TypeScript and production build pass |

## Required operational UAT (sandbox/property)

The automated PostgreSQL UAT is necessary but is not a substitute for a real provider sandbox and authenticated staff session. Before release certification, an authorized operator must execute and attach evidence for:

1. Create one sandbox reservation through the connected distribution provider. Record provider event ID, provider reservation ID, property and test window.
2. Verify exactly one canonical StayNas reservation and guest record; confirm property, source, dates, occupancy, rate and currency.
3. Verify Front Desk can identify the channel reservation and its provider provenance, then hand off to Operations.
4. Verify Operations assigns the intended physical unit, checks readiness and completes check-in. Confirm the provider event alone never marks a guest checked in.
5. Complete check-out. Verify the same physical unit enters the Housekeeping queue as dirty.
6. Housekeeper claims, starts and completes cleaning. Supervisor performs an inspection. Fail once to prove re-clean; then pass and verify the unit is ready.
7. Verify Finance displays provider evidence without creating a payment. Record a real sandbox payment only through the approved payment path, then reconcile the payment separately.
8. Replay the same provider event and verify no duplicate booking, task, allocation, guest or payment.
9. Cancel/reinstate a second test reservation and verify inventory and staff work recover without cross-property visibility.

## Evidence bundle

For each scenario retain:
- provider event/reservation IDs and timestamps (mask guest PII);
- StayNas booking reference and property identifier;
- operational projection, task and physical room identifiers;
- housekeeping task, inspection and transition-log IDs;
- finance evidence ID and payment-event ID, if a payment was actually made;
- screenshots or screen recording from Front Desk, Operations, Housekeeping and Finance;
- CI run URLs and final acceptance sign-off.

## Release boundary

- All automated gates must pass on the exact PR head.
- Sandbox/property UAT must be signed off by an authorized property operator and Nolmark release owner.
- No production credentials, real guest data, production DB changes or production deployment are used by the CI tests.
- A green CI run alone does not certify the live provider connection or production property workflow.
- Any failed scenario is fixed at its owning boundary; do not reopen DC-05.03–.07 infrastructure unless evidence proves a regression.
