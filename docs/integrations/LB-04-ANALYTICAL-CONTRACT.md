# LB-04 — StayNas analytical contract
Status: foundation implementation on `feat/lb04-operational-intelligence`. UAT only.

## Ownership
StayNas is authoritative for reservations, occupancy, arrivals/departures, room inventory, accommodation revenue and folios. LexiBite is authoritative for POS, menu/recipe economics, stock, inventory movements, suppliers and procurement. This schema stores analytical projections and source evidence only.

## Canonical mapping
`lb04_property_links` maps one StayNas property to one LexiBite tenant/property pair. Mapping status must be verified before any cross-product metric is admitted. Currency must match the configured property currency; FX is prohibited without an approved rate source and timestamp.

## Evidence envelope
Every metric carries tenant/organisation, property, metric code, dimensions, period, currency, source system, source record reference, source update time, calculation time, freshness and reconciliation status. Guest-level identities are not stored in the analytical layer; guest spending is aggregated.

## Forecasts and advice
Forecasts preserve method, model version, input evidence, assumptions, horizon and reliability. Recommendations are advisory and never create purchase orders. Anomalies retain detection method and evidence.

## Access
Authenticated reads require StayNas property membership. Writes are service-role only. Service callers must independently authenticate the integration, verify the active property link and scope every query by organisation and property. No production migration or deployment is authorized by this branch.
