# CC02.03 — Package Composition & Compatibility

This milestone defines versioned package composition and explicit add-on compatibility validation. It does not decide which modules belong in Essential, Professional or Enterprise.

## Composition contract

A package composition is scoped to an exact plan code and plan version. It records module capability codes and independently selected add-on codes, with draft/published/retired status and an optional effective-date window. Duplicate module or add-on entries are rejected.

## Compatibility rules

Compatibility is data-driven. A rule may declare modules required by an add-on and other add-ons that conflict with it. Validation reports missing requirements, explicit conflicts and ambiguous duplicate rules. The validator does not invent restrictions: when no rule is supplied, no compatibility restriction is inferred.

## Boundaries

- No plan-to-module inclusion matrix or add-on catalogue is populated.
- No price, subscription, invoice, payment or entitlement behavior.
- No persistence migration, API, UI or production write.
- Plan/version lifecycle remains governed by the catalogue contracts.
- CC-01 persistence and authorization certification remains a prerequisite for durable commercial records.
