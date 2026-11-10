# CPS-04 — Room, Rate & Campaign Offer Configuration

## Implemented contract
- Uses existing `rooms`, `staynas_rate_plans`, and immutable `staynas_rate_plan_publications`.
- Adds one property-scoped selection table for permanent and campaign booking channels; it does not create room, availability, pricing, quote, or reservation records.
- Every selected room and rate publication is checked against the active property, current publication version, room-type assignment, and configured transaction currency.
- Campaign products currently reference an existing published rate-plan snapshot without applying client-side price adjustments. Discounts or package price changes are deliberately not accepted unless represented by an approved published Pricing Engine contract.
- Published product changes are forced back to draft and hidden pending explicit republishing.
- Public reads expose only published, visible products for the requested property and channel.

## Scope boundary
Offer dates, stay restrictions, eligibility metadata, inclusions, exclusions, and terms are configuration metadata. The public booking quote and reservation RPCs remain authoritative for price and availability. No production migration or deployment is part of this branch.
