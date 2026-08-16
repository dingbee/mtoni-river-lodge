/**
 * ResPad migration staging engine (server-only).
 *
 * STAGING + AUDIT ONLY. This module never writes to guests, bookings,
 * calendar_events, room_inventory, rooms, pricing_rules or any other
 * production table. It only touches the `respad_*` staging tables.
 */
import {
  buildNormalizedAccounts,
  detectDuplicates,
  normalizeRecord,
  type NormalizedStagingRow,
  type RespadRawRecord,
} from "./normalize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export const ADMIN_ROLES = ["owner", "manager"] as const;

export async function assertMigrationAdmin(supabase: Sb, userId: string) {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: [...ADMIN_ROLES],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: migration tools are owner/manager only");
}

async function audit(
  supabase: Sb,
  batchId: string | null,
  actorId: string,
  action: string,
  detail: Record<string, unknown>,
) {
  await supabase.from("respad_migration_audit_log").insert({
    migration_batch_id: batchId,
    action,
    phase: "staging",
    actor_id: actorId,
    detail,
  });
}

export type IncomingFile = { source_file: string; records: RespadRawRecord[] };

export type StageResult = {
  batch_id: string;
  batch_name: string;
  source_files: string[];
  source_record_count: number;
  staged_record_count: number;
  normalized_account_count: number;
  relationship_count: number;
  duplicate_candidate_count: number;
  high_confidence_duplicate_count: number;
  review_required_count: number;
  error_count: number;
  per_file: { source_file: string; records: number }[];
  per_group: { groupname: string; records: number }[];
};

/**
 * Import (or re-import) source files into staging. Fully idempotent: staging
 * rows are keyed by (legacy_source, source_file, source_row_key), and derived
 * artefacts are rebuilt from the full staged set on every run.
 */
export async function stageRespadBatch(
  supabase: Sb,
  userId: string,
  input: { batch_name: string; files: IncomingFile[]; notes?: string | null },
): Promise<StageResult> {
  await assertMigrationAdmin(supabase, userId);

  const sourceFiles = input.files.map((f) => f.source_file);
  const sourceRecordCount = input.files.reduce((n, f) => n + f.records.length, 0);

  /* ---------------------------------------------------------- 1. batch row */
  const { data: existing } = await supabase
    .from("respad_migration_batches")
    .select("id, source_files")
    .eq("source_system", "ResPad")
    .eq("batch_name", input.batch_name)
    .maybeSingle();

  let batchId: string;
  if (existing?.id) {
    batchId = existing.id;
    const merged = [...new Set([...(existing.source_files ?? []), ...sourceFiles])];
    await supabase
      .from("respad_migration_batches")
      .update({ status: "importing", source_files: merged, notes: input.notes ?? null })
      .eq("id", batchId);
  } else {
    const { data, error } = await supabase
      .from("respad_migration_batches")
      .insert({
        source_system: "ResPad",
        batch_name: input.batch_name,
        status: "importing",
        source_files: sourceFiles,
        notes: input.notes ?? null,
        created_by: userId,
        imported_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    batchId = data.id;
  }

  await audit(supabase, batchId, userId, "import.started", {
    files: sourceFiles,
    source_record_count: sourceRecordCount,
  });

  /* ------------------------------------------------- 2. normalize + upsert */
  const rows: NormalizedStagingRow[] = [];
  let errorCount = 0;
  for (const file of input.files) {
    file.records.forEach((rec, i) => {
      try {
        rows.push(normalizeRecord(rec ?? {}, file.source_file, i));
      } catch {
        errorCount += 1;
        // Retain unparseable records rather than dropping them.
        rows.push({
          ...normalizeRecord({}, file.source_file, i),
          normalization_status: "failed",
          review_status: "pending",
          quality_flags: ["normalization_error"],
          raw_record: (rec ?? {}) as RespadRawRecord,
        });
      }
    });
  }

  // De-duplicate identical identity keys inside the same payload so the upsert
  // never conflicts with itself; occurrences are still counted.
  const seen = new Map<string, NormalizedStagingRow>();
  for (const r of rows) {
    const k = `${r.source_file}::${r.source_row_key}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  const uniqueRows = [...seen.values()];

  for (let i = 0; i < uniqueRows.length; i += 200) {
    const chunk = uniqueRows.slice(i, i + 200).map((r) => ({
      migration_batch_id: batchId,
      legacy_source: "ResPad",
      ...r,
      account_status: "staged",
    }));
    const { error } = await supabase
      .from("respad_account_staging")
      .upsert(chunk, { onConflict: "legacy_source,source_file,source_row_key" });
    if (error) throw new Error(`staging upsert failed: ${error.message}`);
  }

  /* ------------------------------- 3. rebuild derived artefacts from staging */
  const staged = await fetchAllStaging(supabase, batchId);

  const accounts = buildNormalizedAccounts(
    staged.map((s) => ({ ...s, raw_record: s.raw_record }) as NormalizedStagingRow),
  );

  await supabase.from("respad_duplicate_candidates").delete().eq("migration_batch_id", batchId);
  await supabase
    .from("respad_account_relationship_staging")
    .delete()
    .eq("migration_batch_id", batchId);

  const accountIdByKey = new Map<string, string>();
  for (let i = 0; i < accounts.length; i += 100) {
    const chunk = accounts.slice(i, i + 100).map((a) => ({
      migration_batch_id: batchId,
      legacy_source: "ResPad",
      match_key: a.match_key,
      account_name: a.account_name,
      legacy_clientnames: a.legacy_clientnames,
      legacy_company_ids: a.legacy_company_ids,
      source_files: a.source_files,
      groupnames: a.groupnames,
      emails: a.emails,
      phones: a.phones,
      websites: a.websites,
      domains: a.domains,
      tins: a.tins,
      vrns: a.vrns,
      addresses: a.addresses,
      payment_modes: a.payment_modes,
      country: a.country,
      account_type: a.account_type,
      classification_source: "migration_rule",
      classification_evidence: a.classification_evidence,
      source_record_count: a.source_record_count,
      relationship_count: a.groupnames.length,
      quality_flags: a.quality_flags,
      // review_status is intentionally omitted: reviewer decisions (Phase 1B)
      // must survive re-imports; new rows fall back to the column default
      // ('needs_review').
    }));
    const { data, error } = await supabase
      .from("respad_normalized_accounts")
      .upsert(chunk, { onConflict: "migration_batch_id,match_key" })
      .select("id, match_key");
    if (error) throw new Error(`normalized accounts upsert failed: ${error.message}`);
    for (const r of data ?? []) accountIdByKey.set(r.match_key, r.id);
  }

  // Drop normalized accounts that no longer have any staged rows behind them.
  const liveKeys = new Set(accounts.map((a) => a.match_key));
  const { data: allNorm } = await supabase
    .from("respad_normalized_accounts")
    .select("id, match_key")
    .eq("migration_batch_id", batchId);
  const stale = (allNorm ?? []).filter((n: { match_key: string }) => !liveKeys.has(n.match_key));
  if (stale.length)
    await supabase
      .from("respad_normalized_accounts")
      .delete()
      .in("id", stale.map((s: { id: string }) => s.id));

  /* ------------------------------------- 4. link staging rows + relationships */
  const relationships: Record<string, unknown>[] = [];
  const relSeen = new Set<string>();
  for (const acc of accounts) {
    const accId = accountIdByKey.get(acc.match_key);
    if (!accId) continue;
    const ids = acc.rows.map((r) => (r as NormalizedStagingRow & { id?: string }).id).filter(Boolean) as string[];
    if (ids.length) {
      await supabase
        .from("respad_account_staging")
        .update({ normalized_account_id: accId })
        .in("id", ids);
    }
    for (const r of acc.rows as (NormalizedStagingRow & { id?: string })[]) {
      if (!r.legacy_groupname) continue;
      const key = `${accId}|${r.legacy_groupname}|${r.source_file}`;
      if (relSeen.has(key)) continue;
      relSeen.add(key);
      relationships.push({
        migration_batch_id: batchId,
        staging_account_id: r.id ?? null,
        normalized_account_id: accId,
        legacy_source: "ResPad",
        legacy_company_id: r.legacy_company_id,
        legacy_groupname: r.legacy_groupname,
        source_file: r.source_file,
        relationship_type: "commercial_group",
        raw_record: r.raw_record,
      });
    }
  }
  for (let i = 0; i < relationships.length; i += 200) {
    const { error } = await supabase
      .from("respad_account_relationship_staging")
      .upsert(relationships.slice(i, i + 200), {
        onConflict: "normalized_account_id,legacy_groupname,source_file",
      });
    if (error) throw new Error(`relationship upsert failed: ${error.message}`);
  }

  /* --------------------------------------------------- 5. duplicate detection */
  const groups = detectDuplicates(accounts);
  const dupeRows: Record<string, unknown>[] = [];
  const groupIdByKey = new Map<string, string>();
  for (const g of groups) {
    const gid = crypto.randomUUID();
    groupIdByKey.set(g.key, gid);
    for (const memberKey of g.members) {
      const accId = accountIdByKey.get(memberKey);
      if (!accId) continue;
      dupeRows.push({
        migration_batch_id: batchId,
        duplicate_group_id: gid,
        normalized_account_id: accId,
        confidence: g.confidence,
        match_signals: g.signals,
        match_reason: g.reason,
        is_proposed_master: memberKey === g.proposed_master,
        proposed_action: g.proposed_action,
        resolution_status: "pending",
      });
    }
  }
  for (let i = 0; i < dupeRows.length; i += 200) {
    const { error } = await supabase
      .from("respad_duplicate_candidates")
      .upsert(dupeRows.slice(i, i + 200), {
        onConflict: "migration_batch_id,duplicate_group_id,normalized_account_id",
      });
    if (error) throw new Error(`duplicate candidate upsert failed: ${error.message}`);
  }

  // Stamp duplicate status back onto the normalized accounts.
  for (const g of groups) {
    const gid = groupIdByKey.get(g.key)!;
    const ids = g.members.map((k) => accountIdByKey.get(k)).filter(Boolean) as string[];
    if (!ids.length) continue;
    await supabase
      .from("respad_normalized_accounts")
      .update({ duplicate_group_id: gid, duplicate_confidence: g.confidence, review_status: "pending" })
      .in("id", ids);
    await supabase
      .from("respad_account_staging")
      .update({ duplicate_group_id: gid, duplicate_status: `candidate_${g.confidence}` })
      .in("normalized_account_id", ids);
  }
  const nonDupeIds = accounts
    .filter((a) => !groups.some((g) => g.members.includes(a.match_key)))
    .map((a) => accountIdByKey.get(a.match_key))
    .filter(Boolean) as string[];
  for (let i = 0; i < nonDupeIds.length; i += 200) {
    await supabase
      .from("respad_normalized_accounts")
      .update({ duplicate_group_id: null, duplicate_confidence: null })
      .in("id", nonDupeIds.slice(i, i + 200));
    await supabase
      .from("respad_account_staging")
      .update({ duplicate_group_id: null, duplicate_status: "unique" })
      .in("normalized_account_id", nonDupeIds.slice(i, i + 200));
  }

  /* --------------------------------------------------------- 6. batch totals */
  const perFile = new Map<string, number>();
  const perGroup = new Map<string, number>();
  for (const s of staged) {
    perFile.set(s.source_file, (perFile.get(s.source_file) ?? 0) + 1);
    const g = s.legacy_groupname ?? "(no group)";
    perGroup.set(g, (perGroup.get(g) ?? 0) + 1);
  }

  const highCount = groups.filter((g) => g.confidence === "high").length;
  const reviewRequired = accounts.filter(
    (a) => a.quality_flags.length || groups.some((g) => g.members.includes(a.match_key)),
  ).length;

  const totals = {
    status: "staged",
    source_files: [...perFile.keys()],
    source_record_count: sourceRecordCount,
    staged_record_count: staged.length,
    normalized_account_count: accounts.length,
    relationship_count: relationships.length,
    duplicate_candidate_count: groups.length,
    high_confidence_duplicate_count: highCount,
    review_required_count: reviewRequired,
    error_count: errorCount,
    completed_at: new Date().toISOString(),
  };
  await supabase.from("respad_migration_batches").update(totals).eq("id", batchId);

  await audit(supabase, batchId, userId, "import.completed", totals);

  return {
    batch_id: batchId,
    batch_name: input.batch_name,
    ...totals,
    per_file: [...perFile.entries()].map(([source_file, records]) => ({ source_file, records })),
    per_group: [...perGroup.entries()].map(([groupname, records]) => ({ groupname, records })),
  } as StageResult;
}

/** Paginated fetch of every staged row for a batch (Data API caps at 1000). */
export async function fetchAllStaging(supabase: Sb, batchId: string) {
  const out: (NormalizedStagingRow & { id: string })[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("respad_account_staging")
      .select("*")
      .eq("migration_batch_id", batchId)
      .order("source_file", { ascending: true })
      .order("source_row_index", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as (NormalizedStagingRow & { id: string })[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* -------------------------------------------------------------- reporting */

export async function buildQualityReport(supabase: Sb, batchId: string) {
  const staged = await fetchAllStaging(supabase, batchId);
  const { data: accounts } = await supabase
    .from("respad_normalized_accounts")
    .select("*")
    .eq("migration_batch_id", batchId);
  const { data: dupes } = await supabase
    .from("respad_duplicate_candidates")
    .select("duplicate_group_id, confidence")
    .eq("migration_batch_id", batchId);
  const { count: relCount } = await supabase
    .from("respad_account_relationship_staging")
    .select("id", { count: "exact", head: true })
    .eq("migration_batch_id", batchId);

  const accs = (accounts ?? []) as Record<string, string[] & string>[];
  const countFlag = (flag: string) =>
    staged.filter((s) => (s.quality_flags ?? []).includes(flag)).length;

  const perFile = new Map<string, number>();
  const perGroup = new Map<string, number>();
  for (const s of staged) {
    perFile.set(s.source_file, (perFile.get(s.source_file) ?? 0) + 1);
    perGroup.set(s.legacy_groupname ?? "(no group)", (perGroup.get(s.legacy_groupname ?? "(no group)") ?? 0) + 1);
  }

  const groupIds = new Set((dupes ?? []).map((d: { duplicate_group_id: string }) => d.duplicate_group_id));
  const confOf = new Map<string, string>();
  for (const d of (dupes ?? []) as { duplicate_group_id: string; confidence: string }[])
    confOf.set(d.duplicate_group_id, d.confidence);

  return {
    totals: {
      source_files: perFile.size,
      raw_records: staged.length,
      normalized_accounts: accs.length,
      commercial_relationships: relCount ?? 0,
      duplicate_groups: groupIds.size,
      high_confidence: [...confOf.values()].filter((c) => c === "high").length,
      medium_confidence: [...confOf.values()].filter((c) => c === "medium").length,
      low_confidence: [...confOf.values()].filter((c) => c === "low").length,
      manual_review: accs.filter((a) => (a as unknown as { review_status: string }).review_status !== "approved").length,
    },
    per_file: [...perFile.entries()]
      .map(([source_file, records]) => ({ source_file, records }))
      .sort((a, b) => a.source_file.localeCompare(b.source_file)),
    per_group: [...perGroup.entries()]
      .map(([groupname, records]) => ({ groupname, records }))
      .sort((a, b) => b.records - a.records),
    issues: [
      { key: "missing_email", label: "Missing email", records: countFlag("missing_email") },
      { key: "missing_phone", label: "Missing phone", records: countFlag("missing_phone") },
      { key: "missing_tin", label: "Missing TIN", records: countFlag("missing_tin") },
      { key: "missing_vrn", label: "Missing VRN", records: countFlag("missing_vrn") },
      { key: "missing_website", label: "Missing website", records: countFlag("missing_website") },
      { key: "missing_address", label: "Missing address", records: countFlag("missing_address") },
      { key: "malformed_email", label: "Malformed email candidates", records: countFlag("malformed_email") },
      { key: "malformed_phone", label: "Malformed phone candidates", records: countFlag("malformed_phone") },
      { key: "multiple_emails", label: "Records with multiple emails", records: countFlag("multiple_emails") },
      { key: "missing_client_name", label: "Missing client name", records: countFlag("missing_client_name") },
    ],
    account_issues: [
      {
        key: "multiple_groups",
        label: "Accounts appearing in multiple ResPad groups",
        accounts: accs.filter((a) => (a.quality_flags ?? []).includes("multiple_groups")).length,
      },
      {
        key: "consolidated_from_multiple_records",
        label: "Accounts consolidated from multiple raw records",
        accounts: accs.filter((a) => (a.quality_flags ?? []).includes("consolidated_from_multiple_records")).length,
      },
      {
        key: "multiple_emails",
        label: "Accounts with multiple email addresses",
        accounts: accs.filter((a) => (a.quality_flags ?? []).includes("multiple_emails")).length,
      },
      {
        key: "conflicting_tin",
        label: "Accounts with conflicting TIN values",
        accounts: accs.filter((a) => (a.quality_flags ?? []).includes("conflicting_tin")).length,
      },
      {
        key: "normalization_failed",
        label: "Records that could not be normalized",
        accounts: accs.filter((a) => (a.quality_flags ?? []).includes("normalization_failed")).length,
      },
    ],
  };
}