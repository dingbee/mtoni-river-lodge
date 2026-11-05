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

## Interpretation and handling rules

1. A missing timestamp or filename is **not proof** that the corresponding schema change is absent. The SQL may have been renamed, consolidated, manually applied, or retained only in historical deployment material.
2. A same-name file under a different timestamp is a candidate provenance match, not proof that its SQL is identical. Compare the SQL body and verify the resulting schema objects before classifying it as reconciled.
3. Do not replay missing migrations, insert migration ledger rows, baseline migrations, or alter migration history based only on this inventory.
4. The staged CC-01 migration `20261104210000_cc01_property_access_and_founder_authority.sql` is not an applied live migration. It remains staged for review and PostgreSQL validation.
5. Exact-path Git history was checked for all 58 names initially missing from the repository. One source was recovered from commit `35f7d12` and restored under its applied version. The remaining 57 have no matching file history in this repository; their original SQL cannot be reconstructed from this Git repository alone. Treat them as historical applied records with unresolved source provenance, not as unapplied migrations.

## Execution boundary

This audit used read-only repository and migration-ledger inspection. No migration was applied, no migration history was changed, no database schema or data was modified, and no production deployment occurred.

**Validation limitation:** Existing Nolmark UAT users were used for read-only authenticated-role/JWT-claim RLS checks. No unexpired Auth sessions were present for either UAT account during inspection, so this does not constitute browser sign-in or full application E2E verification. The proposed migration has not been executed against PostgreSQL.
