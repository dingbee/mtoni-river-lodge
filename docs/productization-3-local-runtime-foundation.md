# PRODUCTIZATION-3 — NOVA Hospitality Restaurant & Bar OS
## Local Runtime Foundation — Final Verification & Backup/Restore Gate

**Verdict: 🟢 LOCAL RUNTIME FOUNDATION VERIFIED — READY FOR PRODUCTIZATION-4**

Everything below was proven against a real, freshly initialised installation
(PostgreSQL 17.9 + PostgREST + gateway) over HTTP — not by reading code.

---

## 1. What the local runtime is

```
browser terminals (LAN)
        │  http://<appliance>:8000
        ▼
   NOVA gateway (Bun)         ← only LAN-exposed surface
        ├── /auth/v1/*        local ES256 token issuer
        ├── /nova/v1/bootstrap first-run provisioning
        ├── /health, /ready   operator health
        └── /rest/v1/*  ──►  PostgREST (127.0.0.1:3001) ──► PostgreSQL (127.0.0.1)
```

The application code, migrations, RLS policies and `auth.uid()` contract are
unchanged from the hosted deployment.

---

## 2. Verification results

| Phase | Area | Result |
|---|---|---|
| A | Cold start, dependency-ordered, health-gated | 🟢 stack up in **0.8–3.0 s** |
| B | Local auth: sign-in, refresh rotation, logout, tamper/expiry/foreign-key rejection | 🟢 |
| C | First-run bootstrap: two tenants provisioned, replay-safe, hijack refused | 🟢 |
| D | Tenant isolation through RLS over HTTP (read **and** write, both directions) | 🟢 |
| E/F | Restaurant + Bar operational spine: order → send → bill → pay → receipt → close, stock ledger persisted | 🟢 **46/46 HTTP cases** |
| G | LAN posture: gateway on `0.0.0.0:8000`; database and PostgREST **loopback-only**; no outbound dependency at runtime | 🟢 |
| H | Backup: compressed `pg_dump` custom format + JSON manifest (checksum, versions, install id, tenant list) | 🟢 |
| I | Restore: checksum-verified, refuses corrupted artifacts, restored database fully operational under RLS | 🟢 |
| J | Migration safety: re-run is a no-op (98 applied / 2 not-applicable), post-hoc edit rejected on checksum, failed migration leaves **no** ledger row and **no** partial schema | 🟢 |
| K | Health/degradation: `/ready` returns 503 with the failing component named when PostgREST is down, 200 after recovery | 🟢 |
| L | Security sweep (see §3) | 🟢 after remediation |
| M | Concurrency: two terminals, idempotency keys, append-only ledger, cross-tenant writes under load | 🟢 **6/6** |
| N | Product regression: typecheck clean, **150/150 tests pass** | 🟢 |

---

## 3. Defects found during verification and fixed

1. **Backup lost access grants (critical).** `pg_dump --no-privileges` produced a
   restore in which PostgREST roles had no table privileges — a restored
   appliance authenticated users but returned empty result sets. Privileges are
   now included in the dump; ownership still is not, so the artifact remains
   portable between machines. Re-verified: 230 granted tables after restore, and
   an authenticated user reads their own tenant's rows while a foreign user reads none.
2. **Config renderer executed template content.** `render_template` used `eval`
   without escaping, so a backtick in a comment ran a shell command. Only
   `${VAR}` expansion is now possible.
3. **Local secrets were world-readable and repository-tracked.** The signing key
   and `.env` are removed from version control and ignored, and `start.sh` now
   enforces `0600` on both at every boot. Keys are generated per installation.
4. **Health leaked driver internals.** Component failures now report a plain
   operator message; the raw error goes to the local log only.

---

## 4. Backup & Restore (operator contract)

```bash
local/scripts/backup.sh [target-dir]     # -> nova-<db>-<UTC>.dump + .manifest.json
local/scripts/restore.sh <dump> [dbname] # checksum-verified, refuses tampered artifacts
```

The manifest records app/schema version, install id, PostgreSQL version,
migration count, tenant list, size and SHA-256. Restore recreates the
compatibility roles before loading, so a dump moves to a clean machine.

**Proven:** damage → restore → identical record counts (100 migrations,
3 tenants, 3 orders, 3 payments, 2 receipts, 12 stock movements, 0 orphans),
and a deliberately corrupted artifact is refused.

---

## 5. Known follow-ups (not blockers)

- **Seed tenant in migrations.** The authoritative migrations create a hosted
  property tenant, so a fresh standalone install starts with one extra tenant
  row. Cosmetic today; PRODUCTIZATION-4 should gate seed data behind an install profile.
- **TLS.** LAN traffic is plain HTTP. Terminals are on a trusted local network;
  certificate provisioning belongs to the installer work.
- **Automatic scheduled backups.** Backup is a script; the installer should
  register a timer and a retention policy.
- **`SECURITY DEFINER` grant debt** carried from the hosted platform (tracked
  since the v1.0 baseline audit) is unchanged by this work.
