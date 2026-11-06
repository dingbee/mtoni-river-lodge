# SPE-04.09 — Explainable Pricing

**Status:** IMPLEMENTED · NOLMARK UAT REGRESSION PASS · CI PENDING  
**Branch:** `feat/spe-04-deterministic-pricing-resolver`  
**PR:** #151 (draft; unmerged)

## Objective

Provide a guest-safe explanation for every accommodation night, derived exclusively from the database-authoritative SPE-04 resolver.

## Implementation

- Extended `discover_staynas_public_rate_plans` to return a `nightly_breakdown` for each eligible plan.
- Each night includes the property-local stay date, resolved nightly amount, currency, human-readable rate-source label, pricing basis and source rate.
- Source labels distinguish approved room-specific, plan/room-type, room-type and plan overrides, published daily rates, seasonal rates, occupancy rates and inherited/base rates.
- Public output is deliberately allowlisted. Internal override/source IDs, room-type keys, publication hashes and resolver internals are not exposed.
- Added average nightly rate and retained accommodation subtotal, plan terms and publication identity/version metadata.
- Corrected eligibility boundaries to treat checkout as exclusive: plan and publication effective-to dates need to cover the final charged night (`check_out - 1`), not the checkout date.
- Updated both guest booking experiences: the property direct-booking page renders a nightly breakdown from guest-safe plan discovery, and the main `/book` quote summary displays each nightly amount with its resolver source and pricing basis. No client-side amount calculation was introduced; displayed amounts come from server pricing responses.
- Updated the booking option TypeScript contract.

## Nolmark UAT evidence

Applied migration `20261106240000_spe04_09_explainable_pricing` to Nolmark UAT only.

Read-only discovery test on the existing Nolmark UAT fixture (10–12 December 2026, two adults) returned both plans:
- Advance: USD 144/night × 2 = USD 288.
- Flexible: USD 111/night × 2 = USD 222.

Both plans returned two dated nightly entries, source label `Published base rate`, pricing basis `per_room`, and matching currency/source amounts. Internal source IDs and publication hashes were absent from the guest-facing explanation. Calls were executed inside a rollback-only transaction; no persistent data was written.

## Verification limitations

- Direct UAT function execution passed.
- pgTAP contract file `supabase/tests/spe04_09_explainable_pricing.test.sql` added (6 assertions); runner execution pending because pgTAP is not installed in UAT.
- CI for the updated branch has not yet been verified.
- Browser rendering of the new breakdown is not yet accepted; UI change is in source only and has not been deployed.

## Change control

- No production migration/deployment, merge or live pricing change.
- No booking, inventory, membership, tenant or historical snapshot changes.
- Existing UAT fixtures remain active and marked UAT-only.
