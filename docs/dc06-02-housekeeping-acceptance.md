# DC-06.02 — Housekeeping Operational Acceptance

## Purpose

Validate that distribution-originated reservations are actionable in the Housekeeping work view without changing the authority of canonical reservations, room state, turnover tasks, inspections, or financial records.

This is an operational acceptance guide. CI evidence alone does not certify the physical property workflow.

## Preconditions

- [ ] DC-05.07 operational integration baseline is accepted and available in the test environment.
- [ ] DC-05.08 end-to-end UAT dependency is reviewed; its PR is merged or an explicit dependency exception is recorded.
- [ ] Use a non-production property and test guest/reservation data.
- [ ] A property administrator and Housekeeping staff member can authenticate.
- [ ] A distribution-originated test reservation exists, with provider provenance and a physical room allocation.
- [ ] No production provider credentials or live guest data are used.

## Walkthrough

### 1. Property scope and access

- [ ] Sign in as authorized Housekeeping staff for Property A.
- [ ] Open Operations → Housekeeping → Work.
- [ ] Confirm the distribution handoff panel loads and shows only Property A records.
- [ ] Switch to Property B (or use a separate Property B staff account) and confirm Property A records are absent.
- [ ] Confirm a user without Housekeeping module access cannot load the handoff data.
- [ ] Confirm anonymous access is denied.

**Pass condition:** no cross-property data is visible and unauthorized users cannot retrieve handoffs.

### 2. New distribution arrival

- [ ] Ingest or use a sandbox reservation from a supported distribution provider.
- [ ] Confirm provider name/key and external reservation reference are visible.
- [ ] Confirm booking reference, guest, check-in and check-out dates match the canonical reservation.
- [ ] Confirm the handoff points to the correct physical room/allocation.
- [ ] Confirm the displayed integration status reflects the current operational projection.

**Pass condition:** staff can identify the source reservation and the correct stay/room without manually correlating provider records.

### 3. Room assignment and reconciliation exceptions

- [ ] Test a reservation with no room assignment.
- [ ] Confirm the handoff clearly reports that room assignment is required.
- [ ] Assign the room using the existing authoritative reservation/front-desk workflow.
- [ ] Refresh Housekeeping and confirm the handoff reflects the resolved allocation.
- [ ] If an operational reconciliation error is present, confirm the error is visible and no duplicate booking or task is created by viewing/refreshing the panel.

**Pass condition:** exceptions are visible and resolved through existing authoritative workflows.

### 4. Turnover and inspection lifecycle

- [ ] Complete a test stay and verify its turnover task appears in Housekeeping.
- [ ] Start/claim the task using the existing Housekeeping workflow.
- [ ] Complete cleaning and confirm the room moves to the existing inspection workflow.
- [ ] Fail the inspection and confirm the re-clean task/status is visible.
- [ ] Complete re-cleaning and pass the inspection.
- [ ] Confirm the room reaches the expected clean/ready state through existing state transitions.
- [ ] Refresh the distribution handoff panel and verify it reflects the latest task and inspection state.

**Pass condition:** the distribution handoff panel accurately reflects the authoritative task/inspection lifecycle; it does not itself create tasks or mutate room state.

### 5. Regression and financial invariants

- [ ] Confirm the reservation remains a single canonical booking throughout the walkthrough.
- [ ] Confirm booking payment status, paid amount, currency and payment ledger entries are unchanged by Housekeeping viewing/refreshing.
- [ ] Confirm room-state transitions and task/inspection audit evidence are retained.
- [ ] Confirm existing non-distribution Housekeeping work remains available and unchanged.

**Pass condition:** no duplicate reservation, financial mutation, unauthorized room transition, or loss of audit evidence.

## Evidence to record

Record the environment, property identifier (not guest personal data), tester roles, test reservation reference, provider, timestamps, screenshots with guest details redacted, and pass/fail result for each section. Record any failure with reproduction steps and the relevant correlation/reference ID.

## Exit criteria

DC-06.02 operational acceptance passes only when all five walkthrough sections pass, evidence is recorded, and no severity-1 or severity-2 defect remains open.

A real provider sandbox booking and authenticated property-staff walkthrough are mandatory. If physical/provider configuration is unavailable, mark those checks **DEFERRED — NOT TESTED**; do not infer a pass from CI.

## Safety boundary

This acceptance must not run against production guest data or production provider credentials. Do not apply the review SQL to production, modify production database roles/data, or deploy as part of this walkthrough.