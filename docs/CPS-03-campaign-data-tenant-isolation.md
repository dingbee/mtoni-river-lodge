# CPS-03 — Campaign Data & Tenant Isolation Foundation

**Status:** Implemented on an isolated feature branch; CI verification pending. No production schema or data changes.

## Scope

CPS-03 establishes the data model for both permanent direct-booking pages and tenant-managed campaign pages. It does not implement the publication engine, public resolver, booking conversion or entitlement/usage enforcement.

## Data contracts

- `booking_pages`: one permanent direct-booking page configuration per property.
- `booking_campaigns`: tenant-owned campaign identity, slug, schedule and lifecycle state.
- `campaign_page_content`: versioned campaign content payloads.
- `campaign_room_selections`: selected rooms constrained to the same property as the campaign.
- `campaign_offers`: campaign offer presentation linked to a published StayNas rate-plan snapshot. It stores no price.
- `campaign_attribution`: event evidence linked to the campaign and, when present, a booking from the same property.

Each record carries `organisation_id` and/or `property_id` as appropriate. Composite foreign keys prevent a valid campaign, room, rate publication or booking ID from being paired with a different property or organisation.

## Authorization

- RLS is enabled on all six tables.
- Active property membership and authorised tenant roles govern tenant management.
- Anonymous reads are restricted to published permanent pages and currently published campaign data.
- Attribution is readable by property staff and writable only by the trusted server role.
- Tenant database grants intentionally exclude page, campaign and content publication-state columns. Tenant users create/edit drafts; trusted server-side publication logic in CPS-04 controls `status`, `published_at` and archive transitions.
- Founder commercial policy, add-on assignment and quota configuration remain founder-only.

## Reused platform systems

- Property and organisation identity: `staynas_properties` and `staynas_organisations`.
- Staff access: `staynas_user_has_property_access` and `has_any_role`.
- Room catalogue: `rooms`.
- Booking conversion reference: `bookings`.
- Commercial pricing: `staynas_rate_plan_publications`.

No parallel booking, inventory or pricing schema is introduced. Campaign offers cannot author or override a price; later booking conversion must call the canonical StayNas quote/booking path.

## Release and migration boundary

The migration is committed in the CPS-03 branch and tested by an isolated PostgreSQL 17 workflow. It is not applied to the live StayNas Supabase project. No property records, Mtoni-specific slugs, campaign records, pricing values, entitlements or grants are seeded.

## Exit conditions

1. Isolated migration applies cleanly against the existing platform prerequisites.
2. RLS, tenant membership, cross-property composite references and public publication gates pass.
3. Tenant clients cannot directly publish or unpublish pages/campaigns/content.
4. P1 build and regression checks remain green.
5. Review confirms no duplicate pricing/reservation model and no production side effects.

## Next dependency

CPS-04 implements the server-side publication lifecycle and public page resolver. CPS-04 must call the CPS-02 commercial entitlement contract before campaign activation, then CPS-05 integrates the public campaign booking path with the canonical pricing and reservation engines.