# DC series â€” production migration reconciliation

**Scope:** DC-04 through DC-07 migration ledger alignment for the StayNas Supabase project.

**Safety:** This reconciliation changes repository filenames only. It does not apply, replay, alter, or roll back any production migration.

The production `supabase_migrations.schema_migrations` ledger records the following versions. Repository migration filenames must use these exact version prefixes so Supabase does not treat already-applied changes as pending migrations.

| Production version | Migration                                      |
| ------------------ | ---------------------------------------------- |
| 20261106150041     | dc04_distribution_connection_persistence       |
| 20261106150050     | dc04_distribution_credential_broker            |
| 20261106150109     | dc04_distribution_operation_ledger             |
| 20261106150115     | dc04_distribution_outbox_dispatch              |
| 20261106150121     | dc04_distribution_health_evidence              |
| 20261106150127     | dc05_webhook_processing_replay                 |
| 20261106150136     | dc03r_atomic_booking_inventory                 |
| 20261106150144     | dc05_mapping_identity_resolution               |
| 20261106150151     | dc05_canonical_booking_materialization         |
| 20261106150729     | dc05_spe04_quote_success_contract              |
| 20261106151300     | dc05_trigger_function_execute_privileges       |
| 20261106152219     | dc05_unpaid_chan¶»§q«^