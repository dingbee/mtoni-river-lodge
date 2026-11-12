# DC-06.02 — Housekeeping Operational Acceptance

## Current disposition

**Operational tests: DEFERRED — NOT TESTED (user-directed, 7 November 2026).**

This deferral is an explicit scheduling decision, not a pass or failure. Do not block the next implementation milestone on the physical/provider walkthrough. Preserve these checks as outstanding acceptance evidence and reopen them when a non-production property environment, provider sandbox booking, and authenticated staff walkthrough are available.

## Purpose

Validate that distribution-originated reservations are actionable in the Housekeeping work view without changing the authority of canonical reservations, room state, turnover tasks, inspections, or financial records.

CI evidence does not certify the physical property workflow.

## Deferred walkthrough

The following five acceptance areas are all **DEFERRED — NOT TESTED**:

1. **Property scope and access:** authenticated Housekeeping access, active-property isolation, unauthorized module access and anonymous denial.
2. **New distribution arrival:** provider provenance, external reference, canonical booking details, physical room allocation and integration status from a real sandbox reservation.
3. **Room assignment and reconciliation:** unassigned-room exception, resolution through the authoritative workflow, and confirmation that refresh does not create duplicate bookings/tasks.
4. **Turnover and inspection lifecycle:** task claim/start, cleaning, failed inspection, re-clean, supervisor pass and final room-ready state using authenticated staff workflows.
5. **Regression and financial invariants:** single canonical booking, unchanged payment status/amount/currency/ledger, retained transition audit evidence and unaffected non-distribution Housekeeping work.

## Evidence required when resumed

Use a non-production property and test guest/reservation data. Record the environment, property identifier (not guest personal data), tester roles, test reservation reference, provider, timestamps, redacted screenshots, and pass/fail result for each area. Record failures with reproduction steps and relevant correlation/reference IDs.

## Re-entry criteria

Resume these tests when all of the following are available:
- DC-05.07 operational integration baseline in the test environment.
- DC-05.08 dependency reviewed and either merged or covered by an explicit dependency exception.
- A non-production property, provider sandbox booking, and authenticated property administrator/Housekeeping staff.
- No production provider credentials or live guest data.

When resumed, DC-06.02 operational acceptance passes only when all five areas pass, evidence is recorded, and no severity-1 or severity-2 defect remains open.

## Safety boundary

Do not run this walkthrough against production guest data or production provider credentials. Do not apply review SQL to production, modify production database roles/data, or deploy as part of acceptance.