# DC-07B — credential and connection lifecycle management

## Scope

DC-07B extends the sandbox connection foundation with durable credential rotation and explicit tenant-controlled connection lifecycle operations. It does not add new provider capabilities.

## Credential rotation

- Rotation is available only to active property owners, managers or administrators on the currently selected property.
- New key material is submitted to a server-only function and updated in place through Supabase Vault.
- Raw credentials and Vault references are never returned to the browser.
- Rotation and its audit event are one database transaction.
- A successful rotation moves the external account and connection to `pending_validation`; the connection must pass a new sandbox health check before returning to `connected`.
- Revoked or suspended connections cannot be rotated through this path.

## Lifecycle operations

- `suspend`: immediately prevents credential resolution while retaining the active property grant for possible recovery.
- `resume`: allowed only from `suspended`, returns the connection to `pending_validation`, and requires a fresh health check.
- `revoke`: terminal operation. Revokes the property grant and marks both connection and external account revoked.
- Every transition requires an attributed actor, a human-entered reason and a correlation ID.
- State changes and audit events commit atomically. A revoked connection cannot be reactivated.

## Security boundary

- All state mutation is performed by service-role-only database RPCs.
- Each RPC independently verifies that the actor has an active selected-property owner/manager/admin membership.
- Tenant queries are scoped to the selected property and organisation.
- Credential secrets remain in Vault. The UI displays lifecycle status only; it never reads or renders secret material.
- The provider catalogue remains platform/founder controlled.
- Channex remains sandbox-only with the sole granted capability `connection.health`.

## Verification

The DC-04/DC-07 workflow covers distribution tests, TypeScript and production build. The migration is applied to the shared Supabase project after schema and Vault signature inspection. Post-apply verification confirmed both RPC signatures exist, execution is denied to `anon` and `authenticated`, and granted only to `service_role`. A negative authorization probe confirmed an actor without selected-property membership is rejected. No property connection, credential, membership, booking or financial row was created or modified by the verification. No production deployment was performed.
