# DC-03R â€” Atomic booking and inventory remediation

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

Migration `20261106150136_dc03r_atomic_booking_inventory.sql` adds `staynas_lock_room_inventory_dates`. It creates missing inventory rows and locks every stay date in ascending order. Hold creation, booking allocation, and hold release use the same room/date lock order.

For every date, booking allocation enforces:

`available_units - active_unexpired_holds_not_owned_by_this_booking >= 1`

- A booking without a hold counts every active, unexpired hold.
- A booking converting a hold excludes only the exact hold ID, after validating property, room, dates, expiry, and session token.
- A hold counts every active hold, including another hold from the same session.
- Inventory decrements by exactly one; there is no `GREATEST(available_units - 1, 0)` fallback.
- A failed date raises an exception and rolls back the complete multi-night booking transaction.
- Hold release locks inve¶»§q«^