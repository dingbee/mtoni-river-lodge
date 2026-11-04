# DC-03R — Booking and inventory remediation contract

Status: implementation gate; UAT verification in progress. No production migration or deployment.

Repository baseline: `main` at `18457aca8924329f4dacb133ffcaa0ab85436660`.
Working branch: `fix/dc-03r-booking-inventory-remediation`.

## Verified UAT environment

The authorised test target is the existing isolated StayNas Supabase project in the Nolmark CDMA organisation; no new project or Supabase branch is required.

- Supabase project: `StayNas`, ref `hpsryyywolitgeaacpoy`, organisation `nolmarkcdma`, region `eu-west-1`, status `ACTIVE_HEALTHY`.
- Tester organisation: `Nolmark CDMA`, slug `nolmark-cdma`.
- Tester property: `Nolmark CDMA`, slug `nolmark-cdma-staynas`, property ID `f44ff48a-5449-4464-b0cb-83295fadb468`.
- Existing UAT data at inspection: 3 demo rooms, 1 pre-existing booking, 0 holds, 270 inventory rows. The pre-existing booking is preserved.
- Current ready Vercel preview for the public-booking demo branch: `staynas-7v4hr92te-nolmark.vercel.app`, branch `feat/staynas-public-booking-network-demo`, commit `55e4294469056c532188b5d2734c84062dd553f9`.
- This remediation phase uses the existing Nolmark CDMA tester property as the UAT target. Hostname-based property resolution is explicitly out of scope at this juncture; do not add hostname parsing, domain verification, or hostname-dependent tests as a prerequisite.

## Verified live UAT contract

The UAT database exposes these relevant contracts:

- `create_booking_for_property(_property_id, _room_slug, ...)` — anonymous execution is granted, but the implementation only checks `available_units <= 0` when no hold is supplied. It does not subtract other active holds before a no-hold booking.
- `create_booking_hold_for_property(_property_id, _room_slug, ...)` — anonymous execution is granted; it locks inventory rows and counts overlapping active holds.
- `get_room_availability(_check_in, _check_out, _property_id)` — property membership is required for non-service callers, so an anonymous guest cannot use this contract.
- `release_booking_hold(_hold_id, _session_id)` and `get_booking_hold_for_session(_hold_id, _session_id)` — the installed overloads are two-argument contracts. The app currently sends `_property_id`, so those calls do not match.
- The live hold lookup and release functions contain a literal property UUID. They are not suitable for a property-neutral multitenant platform.
- The UAT database has two `create_booking_for_property` overloads, one with an optional `_payment_method` argument. A call that omits that final argument is ambiguous at the SQL level; the application should have one canonical callable contract.
- The app's `bookingRpc.ts` describes the intended property-scoped contract, but that contract is not the one currently installed in UAT. The unapplied review migration defines an earlier intended guest contract, but must not be applied until the inventory invariant and finance guard are corrected and the app/database release is coordinated.
- The live no-argument `staynas_booking_property_id()` resolver currently uses PostgREST request headers for anonymous requests. This phase does not introduce or depend on hostname resolution. A non-hostname, server-controlled property-context contract for public guest traffic remains a separate design gate; do not substitute a browser-supplied property UUID or a global singleton booking property.

## UAT inventory-race reproduction

A rollback-only test used the one-unit `demo-family-suite` room and a disposable future date:

1. Create an active hold for session A.
2. Create a no-hold booking for guest B against the same room/date.
3. Convert session A's hold into a second booking for the same room/date.
4. Roll back the transaction.

Both booking calls completed without an exception when the finance trigger's transaction-local test context was enabled. A follow-up query confirmed zero residual test bookings, holds, or inventory rows. This demonstrates the allocation defect without changing the existing UAT data.

The finance trigger `enforce_finance_rpc_booking_update()` rejects changes to booking financial fields unless `staynas.payment_rpc='on'` or the request role is `service_role`. The booking RPC does not establish that transaction-local context itself; the rollback test had to set it externally. The corrected booking RPC must set the narrowly scoped flag internally around its initial financial-field write, without exposing a client-settable bypass.


## Application-side prerequisite remediation — scope corrected

- Hostname-specific application changes have been reverted to the repository's main versions.
- The existing `staynas_booking_property_id()` resolver call remains unchanged.
- Hostname normalization helpers and hostname-specific unit tests have been removed.
- The dedicated booking/property GitHub Actions workflow remains in the branch to exercise the existing property-isolation tests, build, TypeScript, and lint checks.
- This phase does not claim a completed public guest property-context solution. A server-controlled, non-hostname property-context contract must be designed separately before public guest E2E can be certified.
- No Vercel deployment or database migration has been initiated.
## Required canonical allocation invariant

For every room and stay date, all allocation paths must serialize on the same `room_inventory(room_id, date)` row lock and enforce:

`available_units - active_unexpired_holds_not_owned_by_this_booking >= 1`

A booking consuming a valid hold must:
1. Lock all inventory date rows in deterministic ascending date order.
2. Lock the hold row after inventory rows to preserve a consistent lock order.
3. Verify hold status is active, not expired, same property, same room, exact check-in/check-out, and exact non-null session ID.
4. Count other active, unexpired overlapping holds for each date, excluding only the exact hold being converted.
5. Require sufficient unallocated inventory for every date, including capacity for every other hold after this booking consumes one unit.
6. Decrement inventory exactly once per date, write booking nights, convert the hold, and write the calendar event in the same transaction.

A booking without a hold must count every active, unexpired hold for each date before decrementing inventory. A hold creation must use the same row-lock ordering and count active holds before inserting. The hold's own session must not be used as a broad exclusion for unrelated holds; only a specifically identified replacement hold may be released/excluded.

All multi-night allocation is atomic: any failed date rolls back every date, booking, hold transition, and event write. No path may use `GREATEST(available_units - 1, 0)` to hide a negative allocation invariant.

## Public guest security contract

- Hostname resolution is out of scope for this remediation phase.
- The property identifier must come from a server-controlled StayNas property context; never accept a browser-supplied property UUID as authority.
- Do not apply a global singleton booking configuration as a shortcut: StayNas is multi-tenant and public booking context must not collapse all properties onto one tenant.
- Anonymous RPCs must be deliberately narrow; staff RPCs must validate authenticated membership for the requested property.
- Do not grant broad anonymous execution to staff functions and do not route guest traffic through the unrestricted service role.
- Public hold lookup/release must require the exact hold ID + high-entropy session token and verify the resolved property. Do not expose unrestricted hold table reads.
- Retire ambiguous unscoped overloads only in the same coordinated migration that installs and grants the replacement contracts.
- No hardcoded property UUIDs in functions.
- The finance-write GUC must only be set inside the trusted booking/payment functions and must be transaction-local.

## Acceptance tests required before promotion

1. The approved server-controlled, non-hostname property context resolves the Nolmark CDMA tester property; cross-property identifiers fail closed.
2. Anonymous hold create, lookup, release, and booking RPC signatures match the application exactly.
3. A guest cannot read/release/convert another session's hold.
4. A hold cannot be converted for a different room, property, or date range.
5. A booking without a hold cannot consume inventory reserved by an active hold.
6. A booking converting its hold excludes only that hold, not any other active holds.
7. Two concurrent holds for the final unit: exactly one succeeds.
8. Hold creation racing a no-hold booking for the final unit: at most one allocation succeeds.
9. Hold conversion racing another booking for the final unit: at most one allocation succeeds.
10. Expired/released/converted holds cannot be reused.
11. Multi-night allocation failure rolls back every prior date's changes.
12. Same-session retries are idempotent or safely rejected; they must never create duplicate bookings or consume inventory twice.
13. A property-A session cannot interact with property-B hold or booking records.
14. Existing staff/front-desk booking flow uses the same allocator and retains property authorization.
15. Initial booking financial fields are accepted only from the trusted booking RPC; direct client updates remain blocked.
16. Migration is repeatable in UAT and leaves no legacy ambiguous callable overloads.

## Execution gate

The existing Nolmark CDMA UAT project and tester property are the authorised test target. No new Supabase branch or project is required. Hostname/domain work is excluded. The rollback-only reproduction made no persistent changes; the pre-existing UAT booking remains untouched. No persistent UAT SQL, production SQL, production deployment, or application deployment has been performed.

The GitHub connector does not provide a checked-out project runtime for local `bun install`, Vitest, TypeScript, ESLint, or Vite build execution. This branch must not be represented as a completed fix until the corrected migration and application changes are run against the existing UAT target, the required tests pass, and CI passes. Production promotion remains separately gated by explicit approval.
