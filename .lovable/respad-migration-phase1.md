# ResPad → Mtoni OS migration — Phase 1 (staging + audit)

Status: infrastructure complete, awaiting source files.
Scope guard: STAGING + AUDIT + MAPPING ONLY. No production writes.

Tables: respad_migration_batches, respad_account_staging,
respad_normalized_accounts, respad_account_relationship_staging,
respad_duplicate_candidates, respad_migration_audit_log. Owner/manager RLS.

Identity (idempotency): (legacy_source, source_file, source_row_key) where
source_row_key = company_id | groupname key | clientname key | tin | email | tel | mobile.

Model: ACCOUNT -> ResPad commercial relationship (groupname) -> future reservation.
groupname is NEVER folded into the account identity.

UI: /admin/settings/migrations/respad
