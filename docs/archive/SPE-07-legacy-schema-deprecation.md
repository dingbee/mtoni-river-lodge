# SPE-07 legacy distribution schema — deprecated

The former SPE-07 `staynas_hospitality_distribution_*` persistence model is retired and must not be applied or referenced by application code.

The canonical distribution persistence contract is the tenant/property-scoped `staynas_distribution_*` model established by DC-04 and extended by DC-05/DC-06/DC-07. Its production migration versions are recorded in `docs/dc-series-production-migration-reconciliation.md`.

Do not recreate compatibility tables for the retired SPE-07 names. Any remaining reference to those names is a defect to remove, not a schema migration to apply.
