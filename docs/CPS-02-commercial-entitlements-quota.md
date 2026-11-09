# CPS-02 — Commercial Entitlements & Quota Integration

**Workstream:** StayNas Direct Booking & Campaign Studio  
**Milestone:** CPS-02  
**Status:** Implementation on isolated feature branch; no production deployment or database writes.

## Capability identities

The commercial capability registry now defines:

- `direct_booking_pages` — permanent property booking page access.
- `campaign_studio` — tenant campaign-page management and publishing.
- `campaign_analytics_advanced` — advanced campaign analytics.

The stable add-on identity is `direct_booking_campaign_studio`. This identity is registered in code only; it is not automatically activated, priced, assigned to subscriptions, or seeded into the live catalogue.

Custom-domain entitlement remains excluded pending explicit commercial approval.

## Founder-controlled configuration

Quota policies are stored as part of the existing versioned `catalogue` policy's add-on definitions. This avoids a second policy store and does not require a new database table or policy type.

Example only — not seeded and not a proposed commercial price:

```json
{
  "code": "direct_booking_campaign_studio",
  "name": "Direct Booking & Campaign Studio",
  "description": "Permanent booking pages and property campaign pages",
  "status": "active",
  "quotaPolicies": [
    {
      "featureCode": "campaign_studio",
      "metric": "campaign_pages.max_active_per_property",
      "limit": 5,
      "scope": "property",
      "period": "concurrent"
    }
  ]
}
```

The example limit of 5 is illustrative only. Founder Admin must set and publish the actual approved limit. No quota is inferred when the policy is absent. The founder grant function refuses to grant `campaign_studio` unless exactly one property-scoped concurrent active-campaign quota is present in the published add-on definition.

## Runtime enforcement

`assertCommercialEntitlement` accepts only trusted server-computed usage metadata. It does not accept a caller-supplied limit.

For a quota-bearing request, the runtime:

1. Resolves the verified tenant actor and organisation.
2. Resolves the current subscription and effective founder grant rules.
3. Identifies the purchased add-on that grants the requested feature.
4. Loads the current published founder catalogue.
5. Resolves exactly one quota policy matching feature, metric, scope and period.
6. Fails closed if the policy is missing, invalid or ambiguous.
7. Passes the founder-authored limit and trusted usage count to the existing CC-05 resolver.
8. Persists the usage evidence in the durable entitlement decision context.

No browser input may supply the usage count or limit. The future CPS campaign write path must calculate active campaign usage from the property-scoped database records and pass that trusted count to this server function.

## Subscription and commercial governance

- CC-05 remains the sole runtime entitlement engine.
- Existing `commercial_subscriptions.addon_codes` remains the subscription assignment source.
- Existing founder-authored `commercial_entitlement_grant_rules` remains the feature grant source.
- Existing versioned catalogue policy remains the add-on and quota configuration source.
- Tenant administrators cannot author commercial grants, change quota values, or alter add-on activation.
- Subscription suspension, expiry, cancellation, overrides and platform restrictions remain enforced by CC-05.

## Compatibility

- Existing add-on payloads without `quotaPolicies` parse as an empty quota-policy list.
- No quota defaults are introduced.
- No commercial catalogue data is seeded or changed.
- No migration is required for the policy payload extension; existing policy-type constraints remain unchanged.
- No production migration or data write is performed.

## Remaining CPS dependencies

- CPS-03 must create the property-scoped booking campaign records and secure RLS.
- CPS-04/05 must calculate active campaign usage server-side and call the entitlement check before publishing or activating a campaign.
- CPS-08 must exercise the entitlement boundary for Mtoni and at least one independent property.
- A founder-approved add-on catalogue entry, grant rule, price and quota must be published through the existing Founder Commercial Control Centre before any tenant receives access.


## Verified CC-03 activation dependency

The inspected CC-03 database contract makes the accepted subscription snapshot immutable, including `addon_codes`. A plan/add-on change must not be implemented as an in-place update to an accepted subscription.

The current repository exposes founder lifecycle commands (activate, suspend, reinstate, cancel and renewal authorization), but no verified founder command/API that creates a new subscription from a server-resolved add-on price selection or amends commercial add-ons through a new accepted subscription snapshot.

The inspected live UAT database also currently has:
- No current published commercial policy pointers.
- Zero entitlement grant rules.
- Zero durable entitlement assignments.
- Zero durable entitlement decisions.

Therefore the code contracts are implemented, but the commercial add-on is not operationally activated in UAT. The new founder grant control correctly refuses to issue an add-on feature grant until the add-on exists and is active in a published catalogue.

**Dependency owner:** CC-03 Subscription Administration / Founder Commercial Control Centre.

**Closure condition:** Provide a founder-authorized commercial purchase/activation path that resolves the add-on price from the published CC-02 pricing policy, captures explicit commercial acceptance, creates the immutable subscription snapshot with the add-on code, and records the appropriate subscription lifecycle/audit evidence. Do not mutate an existing accepted subscription snapshot. Once this contract is available, publish the add-on feature grants and quota policy through Founder Admin.

CPS-02 does not create a parallel subscription workflow or bypass CC-03 immutability. The add-on activation path remains a release-blocking dependency until CC-03 closes it.
