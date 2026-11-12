# DC-07A — Channex provider integration boundary

## Decision

Channex is the first provider adapter, not a hardcoded distribution mode. StayNas keeps a provider-neutral distribution domain and resolves provider implementations through the existing adapter manifest/registry contract.

## Configuration ownership

- Provider catalogue, adapter availability, environment endpoint URLs, exact hostname allowlists, and capability policy are platform-managed configuration.
- The live Nolmark CDMA UAT property uses the same tenant-scoped connection model as other properties; provider catalogue configuration is global platform configuration.
- Channex is enabled for the sandbox environment only. The live environment is absent from its catalogue configuration.
- Property owners/managers with an active selected property can register the external account reference and sandbox API key.
- The API key is submitted to a server-only RPC and stored in Supabase Vault. The browser receives only a connection identifier and safe status; raw key material and Vault references are never returned.
- Account, property grant, connection and audit event are created atomically. The credential is bound to the provider, sandbox environment and property connection.
- Provider endpoint URLs are loaded from the trusted platform catalogue. Tenant/browser payloads cannot choose outbound URLs.

## Initial adapter scope

The Channex 1.0.0 adapter performs a read-only authenticated health check by requesting at most one accessible Channex property. Its manifest advertises only `connection.health`.

A newly provisioned connection remains `pending_validation`. That state is accepted only for the health-check capability. A successful sandbox health check moves the external account and connection to `connected` and appends an attributed lifecycle audit event. Failed checks return a normalized safe error and do not activate the connection.

The platform settings page supports sandbox endpoint/allowlist configuration. Property settings support secure credential registration and a connection health check. No credentials are stored in ordinary configuration rows or returned to the browser.

## Explicitly out of scope

DC-07A does not implement listing discovery/mapping, room or rate-plan mapping, availability/rate/restriction writes, booking ingestion, acknowledgement, webhook processing, or live OTA activation. These remain separate increments with their own contracts, throttling, reconciliation and acceptance tests. No capability beyond `connection.health` is granted.

## Security and release boundaries

- Platform catalogue mutations require the `staynas_platform_admins` allowlist; AI founder-admin authorization is not reused.
- Tenant connection creation requires an active selected property and active owner/manager/admin membership, and the database RPC independently verifies active organisation/property scope.
- Credential creation and resolution RPCs are executable only by `service_role`; browser roles have no table grants.
- The credential broker is permitted to resolve a `pending_validation` secret only for `connection.health` in the sandbox environment.
- The Channex staging hostname is explicitly allowlisted in the platform catalogue; no live endpoint is configured.
- Database migrations were applied to the shared StayNas Supabase project for Nolmark CDMA UAT. This is not a production release or Vercel deployment. No reservation, membership, role or financial records were modified.
