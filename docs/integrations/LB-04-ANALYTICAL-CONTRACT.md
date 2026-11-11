# LB-04 — StayNas analytical contract

Status: implementation branch only; not deployed. Live-tenant inspection is read-only. UAT acceptance and production promotion remain separate gates.

## Ownership
StayNas is authoritative for reservations, occupancy, arrivals/departures, room inventory, accommodation revenue and folios. LexiBite is authoritative for POS transactions, menus, recipe economics, stock, inventory movements, suppliers and procurement. The analytical layer stores governed projections and evidence only; it does not consolidate operational databases.

## Dependency gates
LB-01 connectivity, LB-02 guest/stay references and LB-03 folio posting/reversal/reconciliation must be accepted before guest-level cross-domain metrics or certified combined revenue are enabled. Missing or unverified dependency data produces an explicit unavailable/reconciliation-required result, never a fabricated value.

## Canonical property mapping
`lb04_property_links` maps one StayNas property to one LexiBite tenant/property. The mapping must be active, verified and currency-aligned before any cross-product metric is admitted. The current link contract is one-to-one; do not infer a mapping from similar names or tenant ownership. FX is prohibited without an approved rate source, timestamp and conversion policy.

## Evidence envelope
Every metric carries organisation/tenant, property, metric code, dimensions, period, currency, source system, source record reference, source update time, calculation time, freshness and reconciliation status. Guest-level identities and raw PII are not stored in the analytical layer. Guest spend is aggregated by approved cohort/period only, after LB-02 identity/stay reference verification.

## Forecasts and advice
Occupancy-driven F&B demand requires verified in-house occupancy, historical meal-period capture rate, average spend and outlet capacity. Inventory demand requires complete verified recipe coverage and unit compatibility. Procurement advice uses stock after reservations and open POs, supplier lead time, MOQ, pack size, supplier price and currency. Missing inputs suppress the affected calculation. Forecasts preserve method, model version, input evidence, assumptions, horizon and reliability.

## Revenue and profitability
StayNas is canonical for accommodation revenue; LexiBite is canonical for F&B revenue. Count only posted, paid/reconciled economic events; exclude pending, voided, cancelled and reversed events, and deduplicate mirrored folio/POS events. Keep each property/currency partition separate. Do not certify combined revenue until LB-03 posting, reversals and reconciliation are accepted. Profitability is unavailable unless both revenue and corresponding cost coverage are complete and currency-aligned; F&B contribution is not whole-property profit.

## Anomalies and recommendations
Anomalies retain deterministic detection method, severity, evidence and investigation guidance. Recommendations remain advisory. No automatic purchasing, stock movement, POS change, room-price change, payment posting or financial mutation is permitted.

## Access and operations
Authenticated reads require StayNas property membership. Writes are service-role only. Service callers must independently authenticate the integration, verify the active property link and scope every query by organisation and property. No production migration, source-data mutation or deployment is authorized by this branch.
