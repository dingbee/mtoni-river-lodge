

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


## 11. Booking lifecycle source semantics — verification finding

The canonical StayNas `booking_status` enum includes `pending`, `confirmed`, `cancelled`, `completed` and `no_show`. The current lifecycle control migration additionally uses `checked_in`; the guarded transition graph is:

- `pending → confirmed` or `cancelled`
- `confirmed → checked_in`, `cancelled` or `no_show`
- `checked_in → completed`

For LB-02 projection design, `confirmed` is the candidate source for an expected stay, `checked_in` for in-house, `completed` for checked-out, and the corresponding terminal statuses for cancellation/no-show. This is a projection mapping, not a change to StayNas's source enum.

The existing source model does not define a distinct `departed_early` status. Do not fabricate that event from an assumed field or infer it solely from a booking status. Early departure requires a separately verified timestamp/operational event and explicit source-of-truth rule before it can be included in the contract. Stale or out-of-order events must be rejected by monotonic version/transition checks.


## 12. LB-02.01R — tenant/property integrity remediation (2026-11-09)

Implementation has been prepared on the LB-01 integration foundation branches; it is not applied to production.

- StayNas: additive migration adds a composite foreign key from (local_organisation_id, local_property_id) to staynas_properties(organisation_id, id). The migration first rejects inconsistent existing connection rows, then validates the constraint.
- LexiBite: additive migration adds the composite parent key restaurant_properties(tenant_id, id), then enforces (tenant_id, property_id) on restaurant_locations and (local_tenant_id, local_property_id) on staynas_product_connections. Existing inconsistent location or connection rows cause a fail-closed migration error.
- Both migrations use NOT VALID followed by VALIDATE for the new foreign keys, and are included in isolated verification scripts.
- Negative privileged-write tests attempt cross-organisation/property, cross-tenant/property and cross-tenant outlet inserts; each must fail with a foreign-key violation.
- No data correction, tenant/property rewrite, membership change or production migration is performed.

Acceptance remains pending until the isolated database workflows execute successfully on current branch heads and the full CI/security review is green. LexiBite outlet mapping must use restaurant_locations.id; its new composite ownership FK ensures each location's tenant matches the tenant of its property. The outlet mapping table and event runtime are not yet implemented.
