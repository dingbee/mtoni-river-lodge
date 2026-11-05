# CC02.02 — Commercial Pricing Architecture

This milestone defines pricing records and deterministic quote resolution. It does not publish prices or configure customer-facing plan rates.

## Pricing dimensions

- Plan identity and immutable plan version.
- Currency: exact TZS or USD record; no fallback and no foreign-exchange conversion.
- Billing term: exact monthly or annual record.
- Effective date window and active/draft/retired lifecycle.
- Hybrid property basis: base subscription includes a defined property count; additional properties use a separate per-property amount.
- Add-ons: independently priced as flat or per-property recurring line items.
- Enterprise: supports quote-required pricing with no fabricated public amount.

## Calculation

For fixed pricing:

`Total = Base + max(0, PropertyCount - IncludedProperties) × AdditionalPropertyRate + Σ Add-ons`

All amounts are integer ISO-4217 minor units. TZS and USD amounts are never mixed. A price resolution requires exactly one active plan price for the exact plan version, currency, billing term and date. Each selected add-on must also resolve to exactly one active price with matching currency, term and date.

## Output and boundaries

The resolver returns a line-item breakdown and a price-code/version reference suitable for a later immutable quote or subscription snapshot. It does not create subscriptions, invoices, payments, tax entries or entitlements.

## Not included

- No real plan prices or add-on prices.
- No default price matrix or assumed property allowances.
- No currency conversion.
- No persistence migration, API handler, founder UI or production write.
- No change to hospitality room/rate pricing in `src/lib/pricing.ts`.

CC02.02 remains dependent on CC02.01 catalogue contracts and the unresolved CC-01 persistence/authorization gate.
