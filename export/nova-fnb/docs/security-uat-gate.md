# NOVA Hospitality F&B — Standalone Security + UAT Gate

Scope: `export/nova-fnb/` only. Mtoni OS was not modified (verified: zero
changes outside this directory). No features added, no UI redesign, no deploy,
no commit.

## 1. Authorization model — single authority

The authoritative chain is now, without exception:

```text
USER (app_users, status='active')
  -> rbac_user_roles  (scoped: tenant / property / outlet)
    -> rbac_roles
      -> rbac_role_permissions
        -> rbac_permissions  (DOMAIN:ACTION)
```

`has_any_role`, `has_role` and `is_any_staff` survive only as **compatibility
shims**. Migration `0004_rbac_canonicalisation.sql` rewrites their bodies so
they translate a legacy role name through `rbac_legacy_role_map` and then
answer from the canonical tables. The previous fallback

```sql
OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
```

is gone, and `public.user_roles` is revoked from `authenticated` and `anon`, so
it is no longer reachable through the Data API and cannot be a second source of
truth. Frozen transactional business logic was left alone; only the resolution
underneath it changed.

Authorization is never inferred from email address, user metadata, or any
client-supplied field. Tests assert this at the SQL-body level.

## 2. Bootstrap

`public.nova_grant_owner(uuid, text, text)` is the only way an OWNER comes into
existence. It is idempotent (`ON CONFLICT` on every insert), refuses to mint a
second owner on replay, never creates or deletes an account, and is revoked
from `public`/`anon`/`authenticated` — only `service_role` may execute it. The
appliance installer (`local/sql/post/10-nova-local.sql`) and the demo seed both
call it instead of writing a legacy role row.

## 3. Endpoint surface

262 server functions were inventoried. 261 carry `requireSupabaseAuth`. The one
exception, `receipts/delivery.functions.ts#getSharedReceiptFn`, is a guest
receipt link scoped by an unguessable token rather than by identity — that is
its contract, and the test suite pins it as the *only* permitted exception so a
second unauthenticated endpoint fails the build.

Closed this pass:

| Surface | Before | After |
| --- | --- | --- |
| Document audit trail | authenticated only | `assertTenantRead` + `documents.audit.read` capability |
| Folio room charge (post) | `is_any_staff` | `POS:WRITE` |
| Folio read / validate / status | `is_any_staff` | `POS:READ` |
| Intelligence Core | legacy role strings | `REPORTS:READ` / `REPORTS:WRITE` |

No server function accepts a role, permission or admin flag from the client;
grant and revoke live in `staff.functions.ts` behind `ADMINISTRATION:ADMIN`.

## 4. UI is presentation only

`usePermissions` derives from the server principal and touches no browser
storage. No component decides access from `localStorage`/`sessionStorage`.
Every hidden button has a server-side twin that refuses the same call made
directly against the RPC endpoint.

## 5. Regression gate

`src/lib/rbac/authorization-gate.test.ts` (35 tests) fails the build on:
reintroduction of the legacy fallback, an email/metadata-derived decision, a
missing scope comparison, a non-idempotent or publicly executable bootstrap, an
unauthenticated server function, client-supplied role input, storage-derived UI
authorization, and a folio or document seam that drops back to a bare
signed-in check. Revocation is asserted to take effect on the next call — no
cached or claim-embedded privilege.

## Verdict

- `tsgo --noEmit`: 0 errors
- `vitest run`: 251 passed / 20 files
- `bun run build`: success

**PASS** — the standalone product resolves every authorization decision
through one model.
