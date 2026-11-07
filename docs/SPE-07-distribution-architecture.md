# SPE-07 — Distribution Integration Architecture

Status: implementation foundation only; no provider is certified or enabled.

## Repository boundary

SPE-07 is developed on `feat/spe-07-distribution-integration`, forked from the SPE-06 implementation head. PR #167 remains unchanged and open. No merge, production deployment, live channel activation, production database mutation or credential provisioning is authorized.

## Domain boundaries

The distribution domain is independent from Concierge messaging channels. The existing `ai_concierge_channels` registry is founder-controlled messaging configuration, not an OTA/channel-manager registry, and must not be repurposed.

Canonical ownership remains:
- SPE-03 owns published rate plans, publication snapshots and restrictions.
- SPE-04/05 own deterministic price and tax/fee/promotion resolution.
- SPE-06 owns canonical reservation creation and lifecycle.
- Distribution owns provider connections, external identifiers, mappings, outbound delivery, inbound event normalization, synchronization state and reconciliation.

## Adapter contract

Each provider declares an explicit capability set. The adapter contract rejects advertised operations without an implementation. Provider-specific authentication, payload formats, cursors, acknowledgements and rate-limit semantics stay behind adapters.

No provider adapter is currently certified. A generic adapter contract is not an operational channel integration.

## Mapping invariants

Mappings require exact stable internal and external identifiers and are scoped by tenant, property, connection and mapping type. Fuzzy/name-only mapping is prohibited. Active duplicate internal or external mappings block dispatch.

## Outbound safety

Outbound rate payloads carry the immutable SPE-03 publication reference and publication number. Availability payloads carry a source version and reject inventory totals where reserved, blocked and allocated units exceed physical inventory. Restriction payloads are validated before adapter dispatch. Payload fingerprints are deterministic and are suitable for idempotency-ledger keys.

A provider acknowledgement is the only signal that an outbound operation was accepted externally. Internal queueing must not be reported as external success.

## Inbound safety and SPE-06 dependency

Inbound events are normalized with stable provider account/property/booking/event identifiers, event version, confirmed amount in integer minor units, currency and pricing-component provenance. The external confirmed amount is retained as a historical commitment; it is not replaced with a current public rate.

The existing SPE-06 quote-to-book RPC resolves StayNas pricing and does not, by itself, establish a safe API for accepting an externally confirmed OTA price snapshot. Live inbound booking ingestion therefore remains disabled until a canonical reservation-writer extension explicitly accepts and persists the external commercial snapshot while preserving SPE-06 transactional inventory, idempotency and lifecycle invariants.

## Credential and provider certification gate

Credential references are represented as opaque server-side references only. The implementation must integrate a verified secret broker/encryption service before connection CRUD can store credentials. No secrets may be sent to the browser or written to logs.

Provider certification requires real API documentation, test credentials/sandbox, account/property mapping, verified outbound updates, verified inbound booking events and documented unsupported capabilities. No provider has been certified by this foundation commit.

## Release gates

- SPE-06 authenticated staff-browser acceptance: outstanding.
- SPE-06 concurrent last-room test: outstanding.
- SPE-06 modification/repricing workflow: outstanding.
- SPE-06 Pesapal callback/invoice reconciliation: outstanding.
- SPE-07 migration, persistence, queue workers, Distribution Centre UI and provider sandbox acceptance: not yet implemented/verified.
- Live distribution and inbound booking ingestion: prohibited pending separate authorization and required acceptance.
