# DC-07A — Channex provider integration boundary

## Decision

Channex is the first provider adapter, not a hardcoded distribution mode. StayNas keeps a provider-neutral distribution domain and resolves provider implementations through the existing adapter manifest/registry contract.

## Configuration ownership

- Provider catalogue, adapter availability, environment endpoint URLs, and capability policy are platform-managed configuration.
- Property administrators select an enabled provider and environment, provide their Channex API key, and map their Channex property to a StayNas property.
- The API key is submitted once to a server-only credential broker. The browser receives only a masked credential state and opaque reference; raw key material is never returned.
- Sandbox and live credentials are distinct. Live activation requires an explicit platform-authorised release gate after certification.
- Provider endpoint URLs are injected from trusted platform configuration. Tenant/browser payloads cannot choose arbitrary outbound URLs.

## Initial adapter scope

This foundation implements only a read-only authenticated connection check by listing at most one accessible Channex property. Its manifest advertises only `listing.read` and `connection.health`. It does not claim to implement ARI writes, reservation ingestion, acknowledgement, webhook handling, or channel activation.

## Required next increments

1. Persist platform-managed provider catalogue and per-environment endpoint configuration with strict host allowlisting and audit history.
2. Add server functions for tenant-scoped account credential registration, property grant creation, connection lifecycle, and secret rotation.
3. Add read-only listing/room/rate-plan discovery and explicit mapping approval.
4. Add batched availability and rate/restriction updates with per-property throttling and retry controls.
5. Add booking revision feed polling plus durable idempotent import; acknowledge only after StayNas commits the reservation.
6. Add webhook delivery with polling fallback, reconciliation, and observability.
7. Complete Channex certification in the application before any live activation.

## Security and release boundaries

No provider API key is stored in source, frontend environment variables, local storage, or ordinary connection rows. No production migration or deployment is authorised by this increment. The adapter receives only a server-created execution context and a credential handle bound to that exact connection/environment. Endpoint configuration must be loaded from trusted platform records, never accepted from a tenant request.
