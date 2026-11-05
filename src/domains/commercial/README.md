# StayNas Commercial Domain

CC-02 owns the platform-level commercial catalogue and price-resolution contracts.

## Domain boundaries

- Commercial plans describe what a customer can purchase.
- Commercial plan versions preserve published commercial definitions.
- Commercial modules are capability-level products, not individual navigation entries.
- Commercial add-ons are independently purchasable catalogue products.
- Pricing records and resolution are implemented in CC02.02.
- Package composition and compatibility are implemented in CC02.03.
- Trial policy is implemented in CC02.04.
- Subscription lifecycle belongs to CC-03.
- Invoicing and collections belong to CC-04.
- Runtime entitlement enforcement belongs to CC-05.

## SCEF Baseline v1.0

The only plan identities are Essential, Professional, and Enterprise.
Monthly and annual terms and TZS/USD currencies are supported by the contracts.
This milestone intentionally does not assign prices, plan-module inclusion,
or add-on compatibility without approved commercial configuration.

## Authorization and persistence

Catalogue mutations are founder-only and must be authorized server-side.
Tenant ownership and tenant roles do not confer global commercial authority.

CC02.01 establishes typed contracts and canonical capability identities only.
Database persistence remains gated on the certified CC-01 authority/schema
foundation. No migration is placed in the executable migrations directory.
