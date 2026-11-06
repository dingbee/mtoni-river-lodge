# CC-01 P0 — Migration History Reconciliation

**Audit date:** 5 November 2026  
**Repository:** `dingbee/mtoni-river-lodge`  
**Branch:** `feat/cc01-p0-commercial-foundation`  
**Supabase project:** StayNas / Nolmark CDMA account  
**Method:** Read-only comparison of the live Supabase migration ledger with the repository migration directory.

## Executive result

| Measure | Count |
|---|---:|
| Applied records in live migration ledger | 82 |
| Unique migration version identifiers in repository | 153 |
| Unique migration names in repository | 152 |
| Exact version-and-name matches | 6 |
| Live records whose name exists under another timestamp | 19 |
| Live records with no same-name repository file | 57 |
| Repository versions not present in live ledger | 147 |

## Live ledger mapping

| Applied version | Applied migration name | Repository comparison |
|---|---|---|
| 20261021114927 | `staynas_restore_prerequisite_extensions` | No same-name migration file |
| 20261021123829 | `staynas_restore_pg_net_prerequisite` | No same-name migration file |
| 20261021123838 | `staynas_restore_runtime_extensions` | No same-name migration file |
| 20261021140345 | `staynas_property_room_hardening` | Name exists; timestamp differs |
| 20261021140353 | `staynas_final_hardening` | Name exists; timestamp differs |
| 20261021140632 | `production_rls_baseline_and_tenant_policies` | No same-name migration file |
| 20261021140657 | `secure_email_queue_function_search_paths` | No same-name migration file |
| 20261021140725 | `restrict_internal_security_definer_rpcs` | No same-name migration file |
| 20261021160540 | `restrict_anon_role_helper_execution` | No same-name migration file |
| 20261021160555 | `restrict_public_role_helper_execution` | No same-name migration file |
| 20261021160613 | `restrict_internal_and_room_admin_rpcs` | No same-name migration file |
| 20261023120453 | `restore_room_catalogue_select_grants` | No same-name migration file |
| 20261023130729 | `add_active_property_role_rpc` | No same-name migration file |
| 20261023145209 | `make_property_currency_optional` | No same-name migration file |
| 20261024090325 | `secure_booking_holds_and_calendar_events_access` | No same-name migration file |
| 20261024091022 | `scope_public_mtoni_booking_rpcs_to_property` | No same-name migration file |
| 20261024091542 | `staynas_property_scoped_booking_rpc_contract` | No same-name migration file |
| 20261024092429 | `fix_room_property_trigger_and_onboard_mtoni_rooms` | No same-name migration file |
| 20261024092833 | `complete_mtoni_room_configuration` | No same-name migration file |
| 20261024094051 | `staynas_tenant_domains_and_integration_registry` | No same-name migration file |
| 20261024094107 | `staynas_domain_property_resolution_and_booking_child_rls` | No same-name migration file |
| 20261024094436 | `scope_booking_holds_to_property` | No same-name migration file |
| 20261024095713 | `retire_legacy_unscoped_public_booking_rpcs` | No same-name migration file |
| 20261024123831 | `enable_rls_on_ungranted_public_tables` | No same-name migration file |
| 20261026140226 | `founder_domain_verification_workflow` | No same-name migration file |
| 20261027135055 | `staynas_calendar_operational_feed` | No same-name migration file |
| 20261027151151 | `staynas_calendar_read_grants` | No same-name migration file |
| 20261027210117 | `hk_s1_domain_integrity_reconciliation` | No same-name migration file |
| 20261027210124 | `hk_s2_staff_execution_reconciliation` | No same-name migration file |
| 20261027210129 | `hk_s2_staff_directory_reconciliation` | No same-name migration file |
| 20261027210133 | `hk_s2_task_room_backfill_reconciliation` | No same-name migration file |
| 20261027210141 | `hk_s3_inspection_readiness_reconciliation` | No same-name migration file |
| 20261027210146 | `hk_s4_exceptions_reconciliation` | No same-name migration file |
| 20261027210151 | `hk_s5_realtime_intelligence_reconciliation` | No same-name migration file |
| 20261027210156 | `hk_s5_hardening_reconciliation` | No same-name migration file |
| 20261027210201 | `hk_s5_final_certification_reconciliation` | No same-name migration file |
| 20261027210224 | `hk_s6_certification_reconciliation_idempotent_policies` | No same-name migration file |
| 20261031062115 | `fix_booking_hold_inventory_conflict_target` | No same-name migration file |
| 20261031135804 | `sn_iq_04_session_property_and_authorization_prerequisites` | No same-name migration file |
| 20261031135852 | `sn_iq_04_backfill_legacy_concierge_session_property` | No same-name migration file |
| 20261031135900 | `sn_iq_04_active_property_authorization_helpers` | Name exists; timestamp differs |
| 20261031135909 | `sn_iq_04_2_omnichannel_ledger` | No same-name migration file |
| 20261031135917 | `sn_iq_04_4_provider_routing_and_property_settings` | Name exists; timestamp differs |
| 20261031135922 | `sn_iq_04_4_webhook_inbox` | Name exists; timestamp differs |
| 20261031135928 | `sn_iq_04_5_inbox_processing` | Name exists; timestamp differs |
| 20261031135934 | `sn_iq_04_6_atomic_inbound_processing` | Name exists; timestamp differs |
| 20261031140440 | `sn_iq_04_scope_concierge_session_reads_to_active_property` | No same-name migration file |
| 20261102170637 | `sn_book_05_pay_at_property` | No same-name migration file |
| 20261102170642 | `sn_book_06_property_booking_tax_totals` | No same-name migration file |
| 20261103072106 | `restore_authenticated_self_role_read` | No same-name migration file |
| 20261103072123 | `allow_server_staff_role_assignment` | No same-name migration file |
| 20261103121216 | `nolmark_uat_housekeeping_tenant_scope` | No same-name migration file |
| 20261103124035 | `restore_booking_property_resolver` | No same-name migration file |
| 20261103125201 | `grant_scoped_ops_task_reads` | No same-name migration file |
| 20261103134144 | `add_property_scoped_room_availability_rpc` | No same-name migration file |
| 20261103140512 | `add_property_scoped_create_booking_rpc` | No same-name migration file |
| 20261103140545 | `correct_create_booking_email_validation` | No same-name migration file |
| 20261103141250 | `grant_staff_reservation_patch_columns` | No same-name migration file |
| 20261103142504 | `correct_unpaid_booking_balance_semantics` | No same-name migration file |
| 20261103151030 | `restore_property_scoped_guest_crm_access` | Exact version + name |
| 20261103155748 | `restore_calendar_holds_read_access` | Name exists; timestamp differs |
| 20261103181500 | `finance_payment_integrity_phase1` | Exact version + name |
| 20261103213000 | `pesapal_atomic_finance_finalization` | Exact version + name |
| 20261104092324 | `platform_room_configuration_v3` | No same-name migration file |
| 20261104093748 | `platform_room_media_amenities` | No same-name migration file |
| 20261104121644 | `fix_user_roles_read_rls` | Name exists; timestamp differs |
| 20261104121721 | `allow_staff_role_roster_read` | Name exists; timestamp differs |
| 20261104132112 | `sn_iq_01_founder_only_concierge_channels` | Name exists; timestamp differs |
| 20261104132116 | `sn_iq_01_property_scoped_concierge_rls` | Name exists; timestamp differs |
| 20261104132121 | `sn_iq_02_property_knowledge_catalogue` | Name exists; timestamp differs |
| 20261104132952 | `sn_iq_01_founder_only_ai_activity` | Name exists; timestamp differs |
| 20261104141946 | `finance_refund_integrity_p2_04` | Name exists; timestamp differs |
| 20261104141958 | `finance_refund_reversal_integrity_p2_04` | Name exists; timestamp differs |
| 20261104142002 | `pesapal_provider_reversal_atomic_p2_04` | Name exists; timestamp differs |
| 20261104153450 | `staynas_booking_lifecycle_controls` | Name exists; timestamp differs |
| 20261104164414 | `phase4_guest_document_storage_property_scope` | Name exists; timestamp differs |
| 20261104191703 | `staynas_ai_activity_insert_policy` | Exact version + name |
| 20261104194709 | `phase5_revenue_ledger_property_rls` | Exact version + name |
| 20261104225700 | `staynas_property_branding` | No same-name migration file |
| 20261104230152 | `property_branding_storage_bucket` | No same-name migration file |
| 20261104230157 | `property_branding_storage_policies` | No same-name migration file |
| 20261104232013 | `grant_room_configuration_write_privileges` | Exact version + name (restored from commit `35f7d12`) |

## Historical source recovery

- Exact-path Git commit history was queried for all 58 applied names that initially had no same-name file in the current migration directory.
- The applied migration `20261104232013_grant_room_configuration_write_privileges` was found in commit `35f7d128`; its original SQL was restored unchanged to the repository.
- The remaining 57 applied migration paths returned no file history in this repository. The original SQL is therefore not recoverable from this repository's Git history. Recovering it would require a separate historical artifact or deployment record; it must not be fabricated from migration names.

## PostgreSQL validation (ephemeral, non-production)

**Result:** Passed. GitHub Actions run [41981386114](https://github.com/dingbee/mtoni-river-lodge/actions/runs/41981386114), job `cc01-postgres`.

- PostgreSQL 17.11 service container; no Supabase branch or persistent database was created.
- The schema-only fixture was generated from a read-only catalogue inspection: 264 public table definitions, 62 public enum types, and 64 referenced existing public function signatures represented by test stubs. Minimal Auth and Storage shims support the migration's references.
- `check_function_bodies` was enabled before applying the staged migration.
- The migration execution step passed. The follow-up assertions passed for the 85-policy final catalogue in the clean fixture, `activity_logs.property_id`, removal of the global-role bootstrap trigger, helper-function ACLs, legacy versus property-scoped room-configuration overloads, pinned search paths, self-only membership checks, multi-role resolution, founder registry authority, service-role membership lookup, and suspended-property denial.
- All seed users, properties, memberships, and updates were synthetic rows in the ephemeral database.

**Fixture limitation:** This is a schema-shape test fixture, not a byte-for-byte production `pg_dump`. It omits production rows, existing RLS policy definitions, and pre-existing foreign-key/check/index/trigger state; existing helper-function dependencies are represented by signature stubs. The migration's own DDL, including its new activity-log foreign key and index, was executed. It validates PostgreSQL DDL execution, migration-defined function compilation, policy creation, grants, and selected helper behavior against the current table/column/type/signature shape. It does not certify execution against the exact live schema or replace browser-level UAT.

## Interpretation and handling rules

1. A missing timestamp or filename is **not proof** that the corresponding schema change is absent. The SQL may have been renamed, consolidated, manually applied, or retained only in historical deployment material.
2. A same-name file under a different timestamp is a candidate provenance match, not proof that its SQL is identical. Compare the SQL body and verify the resulting schema objects before classifying it as reconciled.
3. Do not replay missing migrations, insert migration ledger rows, baseline migrations, or alter migration history based only on this inventory.
4. The staged CC-01 migration `20261105094635_cc01_property_access_and_founder_authority.sql` remains unapplied to live Supabase. It has passed an ephemeral PostgreSQL 17.11 execution and contract test; see the validation scope below.
5. Exact-path Git history was checked for all 58 names initially missing from the repository. One source was recovered from commit `35f7d12` and restored under its applied version. The remaining 57 have no matching file history in this repository; their original SQL cannot be reconstructed from this Git repository alone. Treat them as historical applied records with unresolved source provenance, not as unapplied migrations.

## Execution boundary

This audit used read-only inspection of the live migration ledger and schema catalogue. No migration was applied to live StayNas Supabase, no migration history was changed, no live database schema or data was modified, and no production deployment occurred. The staged migration was executed only in the ephemeral GitHub Actions PostgreSQL service described above.

**Remaining P0 gate:** Existing Nolmark UAT users were used for read-only authenticated-role/JWT-claim RLS checks, but neither account had an unexpired Auth session. Browser sign-in and full application E2E verification therefore remain open. The PostgreSQL test above is not a deployment and does not close that gate.


## Live follow-up — 5 November 2026, 09:46 UTC

The live ledger advanced after the initial 82-record audit and the subsequent 90-record check. The current read-only snapshot contains **92 applied migration records**, with latest version **20261105094416** (spe03_rate_plan_room_type_assignments). The active Nolmark CDMA property remains present, and the founder registry contains one row. The CC-01 booking configuration table remains absent, confirming that the staged CC-01 migration has not been applied.

The two latest SPE-03 migration SQL files were located on branch feat/spe-03-rate-plans-calendar and compared byte-for-byte with their corresponding live ledger statements:

- 20261105094407_spe03_rate_plan_foundation.sql — exact match.
- 20261105094416_spe03_rate_plan_room_type_assignments.sql — exact match.

Canonical copies are being restored to this branch so the local migration directory can represent those applied records. This does not merge the SPE-03 feature branch or its application code.

The CC-01 migration was regenerated using the Supabase CLI migration new command as 20261105094635_cc01_property_access_and_founder_authority.sql, placing it after the latest live migration version. The previous 20261105091956 file is retired. The new migration remains staged and unapplied.

**Outstanding provenance:** the earlier audit found 68 of the first 90 applied records without an exact SQL match in this branch. Those records still require source-by-source recovery and version reconciliation. The two new SPE-03 records above have exact sources available, so they do not add to that unresolved count. Do not run a production migration push until the complete local-versus-remote history is reconciled and the dry-run shows only the intended CC-01 migration.

**Release status:** no production migration, migration-history repair, merge, or deployment has been performed. The current post-merge CI passed 5/5 checks before these source-only updates; CI must rerun against the next commit.


## Authoritative source recovery — 5 November 2026

The earlier Git-history-only recovery assessment is superseded by this read-only export of the live production migration ledger. The table `supabase_migrations.schema_migrations` contains **94 applied records** and **462,237 characters of stored SQL**. All 94 rows have a non-empty `statements` array (one statement payload per row).

- **92 records** contain the SQL payload itself in the live ledger and are preserved verbatim in [`docs/cc-01-live-migration-ledger.json`](./cc-01-live-migration-ledger.json).
- **2 records** (`finance_payment_integrity_phase1` and `pesapal_atomic_finance_finalization`) contain a manual-application provenance marker rather than SQL. Their referenced source migration files already exist at the exact applied version/name paths in `supabase/migrations/`.
- The two SPE-03 records added after the earlier 92-row snapshot are `20261105095249_spe03_rate_plan_inheritance` and `20261105095358_spe03_rate_plan_inheritance_snapshots`; their source SQL was verified byte-for-byte against the corresponding feature-branch files. The earlier two SPE-03 records were also exact matches.
- Repository migration directory at this snapshot contains **158 SQL files**. Only **8** currently use an exact version-and-name path from the 94-row live ledger. The ledger export now makes all applied source SQL recoverable, but the active directory still needs canonical file restoration and the remaining local-only migration files need classification before a CLI dry-run can be trusted.
- No migration-history repair, production DDL, data update, merge, or deployment was performed. This JSON is a read-only provenance snapshot, not a migration to execute.

**Release gate:** Do not run `supabase db push` until the active migration directory is reconciled against this 94-row snapshot and the official CLI dry-run shows only the intended CC-01 migration as pending.


## Canonical restoration — 5 November 2026

The live-ledger snapshot was then used to restore the active migration paths on the CC-01 branch:

- All **94/94 applied records** now have a canonical `supabase/migrations/{version}_{name}.sql` path.
- **92 SQL files** are restored verbatim from the live ledger's stored `statements` payloads. The two manually applied records retain their original source files at the exact applied version/name paths; their ledger entries are provenance markers, not SQL payloads.
- **13 duplicate timestamp variants** whose SQL exactly matched an applied record were removed from the active migration directory after their canonical versions were restored.
- **8 divergent timestamp variants** were moved unchanged to `supabase/migration-history-candidates/` so they remain available for review but cannot be accidentally run as migrations.
- The authoritative 94-row ledger export remains at `docs/cc-01-live-migration-ledger.json`.

**Important remaining distinction:** the active migration directory contains **130 local-only migration files** whose versions are not in the live ledger. They are preserved because their role (legacy bootstrap, superseded history, or genuinely pending work) has not yet been proven. They must not be pushed or marked applied blindly. The production migration ledger was not edited. The applied history is now represented at canonical paths; the local-only set still requires classification before the official CLI dry-run can be treated as safe.


## Forward migration exception — SPE-04 public rate-plan discovery

The production ledger snapshot is retained unchanged. The mainline SPE-04 discovery correction at `20261106210000_spe04_public_rate_plan_discovery.sql` is not a duplicate of the already-applied discovery migration: it corrects effective-period eligibility to compare against the final charged night (`check_out - 1`), not the checkout date. It is therefore an approved forward migration and must remain in `supabase/migrations` alongside the staged CC-01 migration. The quarantine allowlist preserves both files; all other non-ledger candidates remain outside the executable migration directory. The isolated PostgreSQL verification applies both and asserts the corrected function body.


## Final release-preflight reconciliation — 6 November 2026, 14:51 UTC

This section supersedes earlier ledger counts and migration sequencing notes above.

- Read-only production migration ledger: **116 applied records**; latest applied version **20261106142428** (spe05_pricing_code_uniqueness).
- The active migration directory now contains **118 files**: 116 canonical applied-version sources plus two deliberately staged forward migrations (CC-01 and the previously approved SPE-04 public rate-plan discovery correction).
- Four SPE-05 source files were recovered from the pre-application Git snapshot `797c598e476bfcf9a52a1e752ace2d7cb0bd06e6` and restored under their exact live version/name paths. They are historical source restoration only; they are not replayed.
- The latest quarantine pass moved **27 non-ledger migration files** byte-for-byte into `supabase/migration-history-candidates/`; **164 candidate files** are retained outside the executable migration directory. The historical source-provenance exceptions remain documented and are not replayed or marked applied.
- CC-01's staged migration is resequenced from `20261105100000` to **`20261106143000`**, after the latest live record and before the staged SPE-04 forward migration. The PostgreSQL fixture workflow and quarantine allowlist use the same canonical filename.
- The official Supabase dry-run workflow now runs the quarantine script inside its own isolated checkout before invoking `supabase db push --dry-run`. This removes the race between the quarantine and dry-run workflows; it does not execute SQL or modify the live database.
- The earlier dry-run on merge commit `a7804c9` is not accepted as release evidence because it ran before the quarantine commit and listed non-ledger SPE-02/SPE-03 migration variants. The post-quarantine dry-run on the exact current head is the acceptance check.

No production migration, migration-history repair, database schema/data/role mutation, merge to main, or deployment has been performed.


## Verification on the integrated mainline — 6 November 2026, 14:57 UTC

The CC-01 branch now includes current mainline commit `6e2e71af78102668c7f308a96d6a48098749f830` as a merge parent; PR #133 is mergeable against main. The final migration source/sequence corrections are on code commit `b3d70244d89a4cf8cb9a46094597ab2f6b1a79a0`.

Verified on that code commit:

- Official Supabase remote dry-run passed. The only pending migrations reported were `20261106143000_cc01_property_access_and_founder_authority.sql` and `20261106210000_spe04_public_rate_plan_discovery.sql`.
- P1 regression/test workflow passed, including regression suites, production build, TypeScript and lint.
- P1 build workflow passed, including the PostgreSQL 17 CC-01 migration/assertion fixture, production build, TypeScript and lint.
- StayNas Finance payment-integrity workflow passed.
- SN-IQ-04 omnichannel contract workflow passed.
- Migration quarantine workflow passed with zero files moved and 164 historical candidates retained.

The subsequent branch head `6117d97cc1d26d5ba996141cff87d560a08d3b20` contains only the generated migration-classification manifest update from the successful quarantine run. This document update triggers a final exact-head CI rerun. All remote migration checks remain dry-run only; no production migration, schema/data/role mutation, merge to main, or deployment has occurred.
