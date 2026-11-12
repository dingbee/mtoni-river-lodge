# DC-06.06 — E2E Verification Evidence & Handover

**Status:** Conditional — software evidence consolidated; live provider/property acceptance outstanding  
**Repository:** `dingbee/mtoni-river-lodge`  
**Base:** `main`  
**Scope:** Documentation and release-evidence control only

## 1. Objective

Consolidate the automated verification evidence for the DC-05 distribution-to-operations path and DC-06 cross-domain integrations into a traceable handover record. Define the remaining provider sandbox, authenticated property-staff, finance-integrity and release-owner acceptance evidence.

DC-06.06 does not introduce application code, database migrations, production data changes, provider configuration, or deployment changes.

## 2. Automated evidence register

| Evidence area | Recorded evidence | Result | Boundary |
|---|---|---|---|
| Canonical distribution materialization | CI Run [#349](https://github.com/dingbee/mtoni-river-lodge/actions/runs/42461024330), job `canonical-materialization-migration`; DC-05.07 operational smoke and DC-06.03/.04/.05 SQL smoke checks executed | PASS | Automated database smoke only |
| Finance application contract | CI Run #349, job `finance-application-check`; production build, TypeScript, Finance regression tests and lint | PASS | Application checks only |
| Tenant isolation and service boundaries | DC-06.05 SQL smoke: service-only ledger privileges/RLS, property authorization and read-only tenant projections | PASS | Test database; not a live tenant walkthrough |
| Reservation/projection integrity | DC-06.05 SQL smoke: external identity and booking uniqueness; operational projection uniqueness | PASS | Automated database evidence |
| Financial provenance | DC-06.05 SQL smoke: finance evidence remains provenance-linked and separate from canonical payment records | PASS | Does not prove a live provider settlement |
| Analytics authorization | DC-06.05 SQL smoke: property authorization and read-only analytics RPC semantics | PASS | Automated authorization contract |
| Replay and lifecycle safety | DC-05.07 operational smoke: replay idempotency, payment-state preservation, no duplicate tasks/allocations and lifecycle transitions | PASS | Automated database evidence |

**Latest recorded verification head:** `3af36adaa0ebb556d2e47d6d8e375b45f53452aa`  
**Verification PR:** [#191](https://github.com/dingbee/mtoni-river-lodge/pull/191) — draft, open, unmerged at the last recorded review.  
**CI run:** [#349](https://github.com/dingbee/mtoni-river-lodge/actions/runs/42461024330).

The CI result is tied to the recorded DC-06.05 head. It must not be represented as a fresh CI result for this documentation-only DC-06.06 branch.

## 3. Required external acceptance evidence

The following are release-blocking until completed by an authorized operator. They are intentionally not marked passed.

| Acceptance item | Required evidence | Owner | Status |
|---|---|---|---|
| Provider sandbox booking | Provider event ID, reservation ID, timestamp, property and test window | Provider/configuration operator | DEFERRED |
| Canonical booking and guest | StayNas booking/property IDs; verified dates, occupancy, rate, currency, source and single-record outcome | StayNas operator | DEFERRED |
| Front Desk handoff | Authenticated staff session evidence showing provider provenance and handoff to Operations | Property staff | DEFERRED |
| Physical room assignment/check-in | Physical unit ID, readiness evidence and check-in record; provider event must not itself check in a guest | Property staff | DEFERRED |
| Checkout and housekeeping | Checkout record, dirty-room transition, housekeeping task ID and claim/start/complete evidence | Housekeeping staff | DEFERRED |
| Inspection failure and recovery | Failed inspection, re-clean task and subsequent passing inspection with audit IDs | Supervisor | DEFERRED |
| Finance and payment integrity | Finance evidence ID; payment-event ID only if a sandbox payment is actually made; evidence/payment separation confirmed | Finance operator | DEFERRED |
| Replay and cancellation/reinstatement | Replayed provider event and second reservation lifecycle evidence proving no duplicates or cross-property exposure | StayNas operator | DEFERRED |
| Final sign-off | Evidence bundle and dated approval from property operator and Nolmark release owner | Property operator + Nolmark release owner | PENDING |

## 4. Evidence bundle format

Attach a single evidence bundle to the release record. Mask guest PII and never include credentials, access tokens, card data or secrets.

For each scenario capture:

- provider event and reservation identifiers, event timestamps and test window;
- StayNas booking reference and property identifier;
- operational projection, room allocation and task identifiers;
- housekeeping task, inspection and transition-log identifiers;
- finance evidence identifier and payment-event identifier, where applicable;
- screenshots or screen recording from Front Desk, Operations, Housekeeping and Finance;
- the exact CI run URL and tested commit SHA;
- operator name/role, execution date, outcome and exception reference.

## 5. Release-readiness matrix

| Gate | Evidence state | Release decision |
|---|---|---|
| Automated database and application verification | Recorded PASS on DC-06.05 head / CI #349 | Satisfied for recorded head only |
| DC-06.06 documentation and traceability | This register and checklist | Satisfied when reviewed |
| Live provider sandbox | Not executed / evidence not attached | BLOCKED |
| Authenticated property-staff walkthrough | Deferred | BLOCKED |
| Physical room and housekeeping lifecycle | Deferred | BLOCKED |
| Live finance/payment reconciliation | Deferred | BLOCKED |
| Property operator and Nolmark sign-off | Not supplied | BLOCKED |
| Production release | Not authorized | NOT APPROVED |

## 6. Acceptance procedure

1. Confirm the exact candidate application commit and rerun the required CI/database checks on that candidate.
2. Execute the provider sandbox and authenticated property-staff scenarios in Section 3.
3. Attach the evidence bundle in Section 4 and reconcile each result against the expected behavior in [DC-05.08 E2E UAT](https://github.com/dingbee/mtoni-river-lodge/blob/feat/dc05-08-e2e-uat/docs/dc05-08-e2e-uat.md).
4. Resolve failed scenarios at their owning boundary and rerun the affected checks.
5. Obtain property operator and Nolmark release-owner sign-off.
6. Reassess release readiness. A green CI run or completion of this document alone is not production approval.

## 7. Explicit exclusions and controls

- No production database or guest data was read or modified as part of this documentation milestone.
- No production credentials or live payment activity are used by the automated evidence described here.
- No provider sandbox test or physical property walkthrough is claimed as complete.
- No application code, schema, migration, provider setting or production configuration is changed by this milestone.
- No merge, production deployment or Vercel production action is authorized by this record.
- Preview deployment controls are temporary execution safeguards and must be restored after the documentation branch and review request are created.

## 8. DC-06.06 exit criteria

DC-06.06 documentation work is complete when this register is committed, linked for review, and the automated evidence references are traceable. The overall distribution-to-operations release remains **CONDITIONAL / NOT CERTIFIED** until all external acceptance items and final sign-offs are attached.
