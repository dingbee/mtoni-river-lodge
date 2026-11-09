

## 10. Canonical schema verification — 2026-11-09

Verified against the active LB-02 branch and current LB-01 PR schema:

- StayNas organisation/property authority is `staynas_organisations` → `staynas_properties`; property ownership is `staynas_properties.organisation_id`.
- StayNas accommodation guest authority is `public.guests`; bookings reference guests through nullable `bookings.guest_id`. Booking snapshots and guest PII are not integration identifiers or payload fields.
- StayNas property access is represented by `staynas_property_members(property_id, user_id, role, status)`.
- LB-01 local mapping authority is `staynas_product_connections`, with local organisation/property, remote tenant/property, canonical integration IDs, status and correlation ID. LB-02 must reuse this mapping authority and its credential system.
- A StayNas property is not interchangeable with an organisation. Mapping authorization must validate the property against its owning organisation.

Open contract checks before LB-02.01 acceptance:
- Verify database-level enforcement of the local organisation/property pair for privileged write paths, not only the authenticated RPC path.
- Confirm exact booking status constraints and transition semantics from the canonical booking schema.
- Verify RLS, grants and authorization for LB-01 RPCs and service adapters on the latest branch heads.

No migration or runtime implementation is authorized by this schema note.
