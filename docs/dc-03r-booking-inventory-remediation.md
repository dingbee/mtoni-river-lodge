# DC-03R — Atomic booking and inventory remediation

Status: implementation branch; UAT verification pending. No database migration has been applied to UAT or production.

## Baseline and target

- Repository: `dingbee/mtoni-river-lodge`
- Implementation branch: `fix/dc-03r-atomic-allocation`
- Base: current `main` at `c3d96f3506d1d6328a2d4a4989cba8987d38bb75`
- UAT project: existing Nolmark CDMA StayNas project
- UAT property: `nolmark-cdma-staynas`, ID `f44ff48a-5449-4464-b0cb-83295fadb468`
- Hostname-based property resolution: explicitly excluded

## Implementation

### Shared inventory lock protocol

Migration `20261105180000_dc03r_atomic_booking_inventory.sql` adds `staynas_lock_room_inventory_dates`. It creates missing inventory rows and locks every stay date in ascending order. Hold creation, booking allocation, and hold release use the same room/date lock order.

For every date, booking allocation enforces:

`available_units - active_unexpired_holds_not_owned_by_this_booking >= 1`

- A booking without a hold counts every active, unexpired hold.
- A booking converting a hold excludes only the exact hold ID, after validating property, room, dates, expiry, and session token.
- A hold counts every active hold, including another hold from the same session.
- Inventory decrements by exactly one; there is no `GREATEST(available_units - 1, 0)` fallback.
- A failed date raises an exception and rolls back the complete multi-night booking transaction.
- Hold release locks inventory dates before locking and changing the hold row.

### Finance guard

The canonical booking RPC sets `staynas.payment_rpc='on'` transaction-locally only around its trusted initial financial-field update, then restores the prior setting. The database finance trigger remains in force for direct writes.

### Public guest property context

Guest server functions now resolve the Nolmark CDMA demo property through a server-owned allowlist and an active property lookup. The browser cannot submit a property UUID as authority. The resolver does not inspect `Host`, `x-forwarded-host`, or other hostname headers.

The service-role client is used only inside server functions; the credential is not sent to the browser. Guest hold create, lookup, release, availability, room catalogue/status, concierge, payment and booking calls use the same server-owned property context. The anonymous `get_room_availability_for_property` RPC is retired. The database `staynas_booking_property_id()` resolver is staff-authenticated only; the hostname-taking overload is removed. Staff functions resolve the authenticated user's active property and membership.

Pesapal callback URLs now require an explicit `PUBLIC_BASE_URL`; the request Host header is not used as a fallback.

This allowlist is deliberately a demo/UAT publication control, not the final multi-property publication-settings architecture. Expanding public property publication requires a separate property-level publication policy.

### Legacy RPC retirement

The unsafe property-first booking overloads and old hardcoded-property hold RPCs are retired in the same migration. Guest access is routed through the canonical server-controlled entry points.

## Verification required

1. CI: PostgreSQL 17 migration and concurrency suite, property-isolation tests, hold-policy tests, public allowlist tests, build, TypeScript and targeted lint.
2. UAT transactional dry-run: execute the migration and functional regression scenarios inside a transaction, then roll back. No persistent test booking or hold is allowed.
3. Allocation tests:
   - hold blocks a no-hold booking for the final unit;
   - conversion consumes exactly one unit and converts only the matching hold;
   - same-session holds are counted independently;
   - cross-property and wrong-session lookup/release fail closed;
   - multi-night failure leaves no partial booking or inventory decrement;
   - concurrent final-unit holds produce exactly one success;
   - hold-versus-booking race produces at most one success.
4. Verify existing staff reservation creation uses the same canonical allocator and still checks property membership.
5. Confirm the exact preview environment has `PUBLIC_BASE_URL` configured before testing Pesapal callbacks; the connected Vercel project list did not return this repository.
5. Re-read the Nolmark CDMA UAT snapshot and confirm the pre-existing booking, room data, memberships and inventory are unchanged after rollback.

## Safety

- No persistent UAT migration or data mutation has been performed.
- No production database modification or deployment.
- No Vercel deployment.
- No hostname-based resolution or hostname-derived payment callback origin.
- No provider activation or distribution traffic.
- Production promotion remains separately gated by explicit authorization.
