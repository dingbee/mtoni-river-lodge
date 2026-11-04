# DC-03R — Booking and inventory remediation contract

Status: implementation gate; not a production migration.

Repository baseline: `main` at `18457aca8924329f4dacb133ffcaa0ab85436660`.
Working branch: `fix/dc-03r-booking-inventory-remediation`.

## Verified live contract

The current production database exposes these relevant contracts:

- `create_booking_for_property(_property_id, _room_slug, ...)` — anonymous execution is granted, but the implementation only checks `available_units <= 0` when no hold is supplied. It does not subtract other active holds before a no-hold booking.
- `create_booking_hold_for_property(_property_id, _room_slug, ...)` — anonymous execution is granted; it locks inventory rows and counts overlapping active holds.
- `get_room_availability(_check_in, _check_out, _property_id)` — property membership is required for non-service callers, so an anonymous guest cannot use this contract.
- `release_booking_hold(_hold_id, _session_id)` and `get_booking_hold_for_session(_hold_id, _session_id)` — the live overloads are two-argument contracts. The app currently sends `_property_id`, so those calls do not match.
- The live hold lookup and release functions contain a literal property UUID. They are not suitable for a property-neutral multitenant platform.

The app's `booking-rpc.ts` describes the intended three-argument/property-scoped contract, but that contract is not the one currently installed in production. The unapplied review migration defines the intended public guest contract, but must not be applied until the inventory invariant is corrected and the app/database release is coordinated.

## Required canonical allocation invariant

For every room and stay date, all allocation paths must serialize on the same `room_inventory(room_id, date)` row lock and enforce:

`available_units - active_unexpired_holds_not_owned_by_this_booking >= 1`

A booking consuming a valid hold must:
1. Lock all inventory date rows in deterministic ascending date order.
2. Lock the hold row.
3. Verify hold status is active, not expired, same property, same room, exact check-in/check-out, and exact non-null session ID.
4. Count other active, unexpired overlapping holds for each date, excluding only the exact hold being converted.
5. Require sufficient unallocated inventory for every date.
6. Decrement inventory exactly once per date, write booking nights, convert the hold, and write the calendar event in the same transaction.

A booking without a hold must count every active, unexpired hold for each date before decrementing inventory. A hold creation must use the same row-lock ordering and count active holds before inserting. The hold's own session must not be used as a broad exclusion for unrelated holds; only a specifically identified replacement hold may be released/excluded.

All multi-night allocation is atomic: any failed date rolls back every date, booking, hold transition, and event write. No path may use `GREATEST(available_units - 1, 0)` to hide a negative allocation invariant.

## Public guest security contract

- The property identifier must be resolved from server-controlled booking configuration, never accepted as authority merely because it came from a browser.
- Anonymous RPCs must be deliberately narrow and only operate on that configured property; staff RPCs must validate authenticated membership for the requested property.
- Do not grant broad anonymous execution to staff functions and do not route guest traffic through the unrestricted service role.
- Public hold lookup/release must require the exact hold ID + high-entropy session token and verify the configured property. Do not expose unrestricted hold table reads.
- Retire ambiguous unscoped overloads only in the same coordinated migration that installs and grants the replacement contracts.
- No hardcoded property UUIDs in functions.

## Acceptance tests required before promotion

1. Anonymous availability works only for the configured booking property; inactive/missing config fails closed.
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
15. Migration is repeatable in a disposable database and leaves no legacy ambiguous callable overloads.

## Execution gate

The current GitHub connector supports repository changes but does not provide a checked-out project runtime for `bun install`, Vitest, TypeScript, ESLint, or Vite build execution. The connected Supabase project is production; production DDL is prohibited in this phase. Therefore this branch must not be represented as a completed fix until the migration and tests have been run against a disposable Supabase development branch and CI has passed.

No production SQL was executed for this remediation.