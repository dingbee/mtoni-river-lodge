# CC-03 follow-on — Founder-managed commercial policy administration

## Authority boundary
- Nolmark CDMA is the global commercial owner.
- Only a verified founder principal with active membership in the configured founder organisation may administer global policies.
- Tenant administrators, tenant staff and service principals cannot read or write global policy configuration through the application.
- Founder visibility in the navigation is convenience only; every server operation and the database write RPC independently rechecks founder authority.
- No founder identity or founder-tenant mapping is created by this implementation.

## Configuration surface
The authenticated founder workspace at `/admin/commercial` provides four policy editors:
- Plan catalogue: Essential, Professional and Enterprise, versioned plan records, modules and add-ons.
- Pricing: TZS/USD monthly and annual pricing, hybrid property allowances, add-on charges, and quote-required Enterprise pricing.
- Package composition: included modules, independently purchasable add-ons and explicit compatibility rules.
- Trial policy: plan-version trial policies using the fixed 14-day duration and subscription-activation trigger.

Published catalogue, pricing, composition and trial payloads are schema-validated. Publishing requires all three SCEF plans; pricing must explicitly cover both currencies and both billing terms; trial policies must explicitly cover the three plans. No amounts, FX rates, bundle contents or policy values are pre-populated.

## Persistence and audit
- `commercial_policy_config_versions` stores append-only immutable versions.
- `commercial_policy_config_current` identifies the current published version per policy family.
- The caller-bound `commercial_record_policy_config` database function derives `auth.uid()`, checks `commercial_is_founder_admin`, advances the current pointer when publishing, and writes the audit event in the same transaction.
- Browser roles have no direct table privileges. The service role has read-only access for trusted server resolution.
- Tenant-specific policy overrides are not supported.

## Trial activation
Trial activation reads only the current published trial-policy version from durable database configuration. Missing, malformed, disabled, expired or ambiguous policy continues to fail closed. The former `STAYNAS_COMMERCIAL_TRIAL_POLICIES_JSON` environment dependency is no longer used.

## Release boundary
This change is additive and is not a production deployment or migration authorization. No production schema, founder membership, founder organisation mapping, catalogue, price, trial policy or subscription record is changed by this implementation sprint. Founder provisioning and first policy authoring remain controlled operational steps after review and release approval.
