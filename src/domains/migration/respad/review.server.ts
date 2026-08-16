/**
 * ResPad Phase 1B — human reconciliation engine (server-only).
 *
 * STAGING ONLY. Nothing in this module writes to any production table.
 * Source rows (respad_account_staging) are never mutated or deleted; all
 * reviewer decisions land on respad_normalized_accounts /
 * respad_duplicate_candidates and are mirrored into the audit log.
 */
import { assertMigrationAdmin } from "./respad.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const REVIEW_STATUSES = [
  "needs_review",
  "pending",
  "approved",
  "rejected",
  "merged",
] as const;

export const ACCOUNT_TYPES = [
  "tour_operator",
  "ota",
  "booking_channel",
  "corporate",
  "organization",
  "direct",
  "other",
  "unknown",
] as const;

export const QUALITY_FLAGS = [
  "missing_vrn",
  "missing_website",
  "missing_tin",
  "missing_phone",
  "missing_email",
  "missing_address",
  "malformed_email",
  "malformed_phone",
  "multiple_emails",
] as const;

const ACCOUNT_FIELDS =
  "id, migration_batch_id, match_key, account_name, legacy_clientnames, legacy_company_ids, source_files, groupnames, emails, phones, websites, domains, tins, vrns, addresses, payment_modes, country, account_type, classification_source, classification_evidence, classification_reviewed, source_record_count, relationship_count, quality_flags, review_status, reviewed_by, reviewed_at, review_notes, merged_into_account_id, notes, canonical_name, canonical_account_type, canonical_email, canonical_phone, canonical_mobile, canonical_address, canonical_website, canonical_tin, canonical_vrn, canonical_notes, canonical_contacts";

async function logReview(
  supabase: Sb,
  batchId: string | null,
  actorId: string,
  action: string,
  opts: {
    targetTable?: string;
    targetId?: string | null;
    previous?: unknown;
    next?: unknown;
    notes?: string | null;
    detail?: Row;
  },
) {
  await supabase.from("respad_migration_audit_log").insert({
    migration_batch_id: batchId,
    action,
    phase: "reconciliation",
    actor_id: actorId,
    target_table: opts.targetTable ?? "respad_normalized_accounts",
    target_id: opts.targetId ?? null,
    previous_value: opts.previous === undefined ? null : (opts.previous as Row),
    new_value: opts.next === undefined ? null : (opts.next as Row),
    notes: opts.notes ?? null,
    detail: opts.detail ?? {},
  });
}

async function loadAccount(supabase: Sb, accountId: string) {
  const { data, error } = await supabase
    .from("respad_normalized_accounts")
    .select(ACCOUNT_FIELDS)
    .eq("id", accountId)
    .single();
  if (error) throw new Error(error.message);
  return data as Row;
}

/* ------------------------------------------------------------ account list */

export async function listReviewAccounts(
  supabase: Sb,
  input: {
    batch_id: string;
    review_status?: string;
    account_type?: string;
    quality_flag?: string;
    search?: string;
    only_multi_record?: boolean;
    only_multi_group?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  let q = supabase
    .from("respad_normalized_accounts")
    .select(ACCOUNT_FIELDS, { count: "exact" })
    .eq("migration_batch_id", input.batch_id);
  if (input.review_status) q = q.eq("review_status", input.review_status);
  if (input.account_type) q = q.eq("account_type", input.account_type);
  if (input.quality_flag) q = q.contains("quality_flags", [input.quality_flag]);
  if (input.search) q = q.ilike("account_name", `%${input.search}%`);
  if (input.only_multi_record) q = q.gt("source_record_count", 1);
  if (input.only_multi_group) q = q.gt("relationship_count", 1);
  const { data, error, count } = await q
    .order("account_name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as Row[], total: count ?? 0 };
}

/** Canonical account + every source row and group relationship behind it. */
export async function getAccountDossier(supabase: Sb, accountId: string) {
  const account = await loadAccount(supabase, accountId);
  const [{ data: sources }, { data: relationships }, { data: dupes }] = await Promise.all([
    supabase
      .from("respad_account_staging")
      .select(
        "id, source_file, source_row_index, legacy_company_id, legacy_groupname, legacy_clientname, legacy_email, legacy_telephone, legacy_mobile, legacy_tin, legacy_vrn, legacy_website, legacy_address, legacy_payment_mode, normalized_emails, normalized_phones, quality_flags, raw_record",
      )
      .eq("normalized_account_id", accountId)
      .order("source_file", { ascending: true }),
    supabase
      .from("respad_account_relationship_staging")
      .select("id, legacy_groupname, source_file, relationship_type, legacy_company_id")
      .eq("normalized_account_id", accountId),
    supabase
      .from("respad_duplicate_candidates")
      .select("duplicate_group_id, confidence, match_reason, resolution_status")
      .eq("normalized_account_id", accountId),
  ]);
  return {
    account,
    sources: (sources ?? []) as Row[],
    relationships: (relationships ?? []) as Row[],
    duplicates: (dupes ?? []) as Row[],
  };
}

/* ------------------------------------------------------------- duplicates */

export async function listDuplicateGroups(supabase: Sb, batchId: string) {
  const { data, error } = await supabase
    .from("respad_duplicate_candidates")
    .select(
      `id, duplicate_group_id, confidence, match_signals, match_reason, is_proposed_master,
       proposed_action, resolution_status, resolution_notes, resolved_at, canonical_account_id,
       normalized_account_id, respad_normalized_accounts(${ACCOUNT_FIELDS})`,
    )
    .eq("migration_batch_id", batchId)
    .limit(2000);
  if (error) throw new Error(error.message);

  const byGroup = new Map<string, Row>();
  for (const row of (data ?? []) as Row[]) {
    const g = byGroup.get(row.duplicate_group_id) ?? {
      duplicate_group_id: row.duplicate_group_id,
      confidence: row.confidence,
      match_signals: row.match_signals ?? [],
      match_reason: row.match_reason,
      proposed_action: row.proposed_action,
      resolution_status: row.resolution_status,
      resolution_notes: row.resolution_notes,
      resolved_at: row.resolved_at,
      canonical_account_id: row.canonical_account_id,
      members: [] as Row[],
    };
    g.members.push({
      candidate_id: row.id,
      is_proposed_master: row.is_proposed_master,
      account: row.respad_normalized_accounts,
    });
    byGroup.set(row.duplicate_group_id, g);
  }

  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  return [...byGroup.values()]
    .map((g): Row => ({ ...g, analysis: analyseGroup(g.members as Row[]) }))
    .sort(
      (a, b) =>
        (a.resolution_status === "pending" ? 0 : 1) - (b.resolution_status === "pending" ? 0 : 1) ||
        (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3),
    );
}

const COMPARE_FIELDS: { key: string; label: string; array?: boolean }[] = [
  { key: "account_name", label: "Normalized name" },
  { key: "tins", label: "TIN", array: true },
  { key: "vrns", label: "VRN", array: true },
  { key: "emails", label: "Email", array: true },
  { key: "phones", label: "Phone", array: true },
  { key: "websites", label: "Website", array: true },
  { key: "addresses", label: "Address", array: true },
  { key: "groupnames", label: "ResPad group", array: true },
  { key: "source_files", label: "Source file", array: true },
];

function analyseGroup(members: Row[]) {
  const matching: string[] = [];
  const conflicting: string[] = [];
  for (const f of COMPARE_FIELDS) {
    const sets = members.map((m) => {
      const v = m.account?.[f.key];
      const list: string[] = f.array ? (v ?? []) : v ? [v] : [];
      return new Set(list.map((x) => String(x).toLowerCase().trim()).filter(Boolean));
    });
    if (sets.some((s) => s.size === 0)) continue;
    const [first, ...rest] = sets;
    const shared = [...first].some((v) => rest.every((s) => s.has(v)));
    if (shared) matching.push(f.label);
    else conflicting.push(f.label);
  }
  return { matching, conflicting };
}

export async function resolveDuplicateGroup(
  supabase: Sb,
  userId: string,
  input: {
    batch_id: string;
    duplicate_group_id: string;
    decision: "merge" | "separate" | "needs_review";
    canonical_account_id?: string | null;
    notes?: string | null;
  },
) {
  const { data: rows, error } = await supabase
    .from("respad_duplicate_candidates")
    .select("id, normalized_account_id, resolution_status, is_proposed_master")
    .eq("migration_batch_id", input.batch_id)
    .eq("duplicate_group_id", input.duplicate_group_id);
  if (error) throw new Error(error.message);
  const members = (rows ?? []) as Row[];
  if (!members.length) throw new Error("Duplicate group not found");

  const now = new Date().toISOString();
  const status =
    input.decision === "merge"
      ? "confirmed_duplicate"
      : input.decision === "separate"
        ? "not_duplicate"
        : "needs_review";

  let canonicalId = input.canonical_account_id ?? null;
  if (input.decision === "merge") {
    canonicalId =
      canonicalId ??
      members.find((m) => m.is_proposed_master)?.normalized_account_id ??
      members[0].normalized_account_id;
    if (!members.some((m) => m.normalized_account_id === canonicalId))
      throw new Error("Canonical account must be one of the duplicate group members");
  }

  await supabase
    .from("respad_duplicate_candidates")
    .update({
      resolution_status: status,
      resolution_notes: input.notes ?? null,
      resolved_by: userId,
      resolved_at: now,
      canonical_account_id: canonicalId,
    })
    .eq("migration_batch_id", input.batch_id)
    .eq("duplicate_group_id", input.duplicate_group_id);

  if (input.decision === "merge" && canonicalId) {
    // Source rows are never deleted — we only record the canonical target.
    const others = members
      .map((m) => m.normalized_account_id as string)
      .filter((id) => id !== canonicalId);
    if (others.length) {
      await supabase
        .from("respad_normalized_accounts")
        .update({
          review_status: "merged",
          merged_into_account_id: canonicalId,
          reviewed_by: userId,
          reviewed_at: now,
          review_notes: input.notes ?? null,
        })
        .in("id", others);
    }
    await supabase
      .from("respad_normalized_accounts")
      .update({ merged_into_account_id: null })
      .eq("id", canonicalId);
  }

  if (input.decision === "separate") {
    await supabase
      .from("respad_normalized_accounts")
      .update({ merged_into_account_id: null })
      .in(
        "id",
        members.map((m) => m.normalized_account_id),
      )
      .eq("review_status", "merged");
  }

  await logReview(
    supabase,
    input.batch_id,
    userId,
    input.decision === "merge"
      ? "DUPLICATE_CONFIRMED"
      : input.decision === "separate"
        ? "DUPLICATE_REJECTED"
        : "DUPLICATE_DEFERRED",
    {
      targetTable: "respad_duplicate_candidates",
      targetId: null,
      previous: { resolution_status: members[0].resolution_status },
      next: { resolution_status: status, canonical_account_id: canonicalId },
      notes: input.notes ?? null,
      detail: {
        duplicate_group_id: input.duplicate_group_id,
        member_account_ids: members.map((m) => m.normalized_account_id),
      },
    },
  );

  return { duplicate_group_id: input.duplicate_group_id, resolution_status: status, canonical_account_id: canonicalId };
}

/* --------------------------------------------------------- account review */

export async function setAccountReview(
  supabase: Sb,
  userId: string,
  input: { account_id: string; review_status: string; notes?: string | null },
) {
  if (!(REVIEW_STATUSES as readonly string[]).includes(input.review_status))
    throw new Error("Unsupported review status");
  const before = await loadAccount(supabase, input.account_id);
  const now = new Date().toISOString();
  const patch: Row = {
    review_status: input.review_status,
    reviewed_by: userId,
    reviewed_at: now,
    review_notes: input.notes ?? null,
  };
  if (input.review_status !== "merged") patch.merged_into_account_id = null;
  const { error } = await supabase
    .from("respad_normalized_accounts")
    .update(patch)
    .eq("id", input.account_id);
  if (error) throw new Error(error.message);

  const action =
    input.review_status === "approved"
      ? "ACCOUNT_APPROVED"
      : input.review_status === "rejected"
        ? "ACCOUNT_REJECTED"
        : "ACCOUNT_REVIEW_STATUS_CHANGED";
  await logReview(supabase, before.migration_batch_id, userId, action, {
    targetId: input.account_id,
    previous: { review_status: before.review_status },
    next: { review_status: input.review_status },
    notes: input.notes ?? null,
    detail: { account_name: before.account_name },
  });
  return { ok: true };
}

export async function bulkSetAccountReview(
  supabase: Sb,
  userId: string,
  input: { batch_id: string; account_ids: string[]; review_status: string; notes?: string | null },
) {
  for (const id of input.account_ids) {
    await setAccountReview(supabase, userId, {
      account_id: id,
      review_status: input.review_status,
      notes: input.notes ?? null,
    });
  }
  return { updated: input.account_ids.length };
}

export async function setAccountClassification(
  supabase: Sb,
  userId: string,
  input: { account_id: string; account_type: string; notes?: string | null },
) {
  if (!(ACCOUNT_TYPES as readonly string[]).includes(input.account_type))
    throw new Error("Unsupported account type");
  const before = await loadAccount(supabase, input.account_id);
  const { error } = await supabase
    .from("respad_normalized_accounts")
    .update({
      account_type: input.account_type,
      canonical_account_type: input.account_type,
      classification_source: "manual_review",
      classification_reviewed: true,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.account_id);
  if (error) throw new Error(error.message);

  await logReview(supabase, before.migration_batch_id, userId, "CLASSIFICATION_CHANGED", {
    targetId: input.account_id,
    previous: { account_type: before.account_type, classification_source: before.classification_source },
    next: { account_type: input.account_type, classification_source: "manual_review" },
    notes: input.notes ?? null,
    detail: { account_name: before.account_name },
  });
  return { ok: true };
}

const CANONICAL_KEYS = [
  "canonical_name",
  "canonical_account_type",
  "canonical_email",
  "canonical_phone",
  "canonical_mobile",
  "canonical_address",
  "canonical_website",
  "canonical_tin",
  "canonical_vrn",
  "canonical_notes",
] as const;

export async function updateCanonicalAccount(
  supabase: Sb,
  userId: string,
  input: { account_id: string; patch: Row; contacts?: Row[] | null; notes?: string | null },
) {
  const before = await loadAccount(supabase, input.account_id);
  const patch: Row = {};
  for (const k of CANONICAL_KEYS) {
    if (k in input.patch) patch[k] = input.patch[k] === "" ? null : input.patch[k];
  }
  if (
    patch.canonical_account_type &&
    !(ACCOUNT_TYPES as readonly string[]).includes(patch.canonical_account_type)
  )
    throw new Error("Unsupported account type");
  if (input.contacts) patch.canonical_contacts = input.contacts;
  if (!Object.keys(patch).length) return { ok: true };

  const { error } = await supabase
    .from("respad_normalized_accounts")
    .update({ ...patch, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", input.account_id);
  if (error) throw new Error(error.message);

  const nameChanged = "canonical_name" in patch && patch.canonical_name !== before.canonical_name;
  const previous: Row = {};
  for (const k of Object.keys(patch)) previous[k] = before[k];
  await logReview(
    supabase,
    before.migration_batch_id,
    userId,
    nameChanged ? "ACCOUNT_NAME_CORRECTED" : "CONTACT_CORRECTED",
    {
      targetId: input.account_id,
      previous,
      next: patch,
      notes: input.notes ?? null,
      detail: { account_name: before.account_name },
    },
  );
  return { ok: true };
}

/* ----------------------------------------------------- readiness dashboard */

export async function buildReadinessReport(supabase: Sb, batchId: string) {
  const [{ data: accounts, error }, { data: dupes }] = await Promise.all([
    supabase
      .from("respad_normalized_accounts")
      .select("id, account_name, account_type, review_status, quality_flags, source_record_count, relationship_count, classification_reviewed")
      .eq("migration_batch_id", batchId),
    supabase
      .from("respad_duplicate_candidates")
      .select("duplicate_group_id, confidence, resolution_status")
      .eq("migration_batch_id", batchId),
  ]);
  if (error) throw new Error(error.message);
  const accs = (accounts ?? []) as Row[];

  const byStatus = (s: string) => accs.filter((a) => a.review_status === s).length;
  const groups = new Map<string, Row>();
  for (const d of (dupes ?? []) as Row[]) groups.set(d.duplicate_group_id, d);
  const groupList = [...groups.values()];

  const flagCounts: Row = {};
  for (const f of QUALITY_FLAGS)
    flagCounts[f] = accs.filter((a) => (a.quality_flags ?? []).includes(f)).length;

  const unresolvedDuplicates = groupList.filter((g) => g.resolution_status === "pending").length;
  const unknownClassifications = accs.filter((a) => a.account_type === "unknown").length;
  const needsReview = byStatus("needs_review") + byStatus("pending");

  return {
    totals: {
      normalized_accounts: accs.length,
      approved: byStatus("approved"),
      rejected: byStatus("rejected"),
      merged: byStatus("merged"),
      needs_review: byStatus("needs_review"),
      pending: byStatus("pending"),
      reviewed: accs.length - needsReview,
    },
    duplicates: {
      groups: groupList.length,
      unresolved: unresolvedDuplicates,
      confirmed: groupList.filter((g) => g.resolution_status === "confirmed_duplicate").length,
      rejected: groupList.filter((g) => g.resolution_status === "not_duplicate").length,
      deferred: groupList.filter((g) => g.resolution_status === "needs_review").length,
      high_confidence_unresolved: groupList.filter(
        (g) => g.confidence === "high" && g.resolution_status === "pending",
      ).length,
    },
    classification: {
      unknown: unknownClassifications,
      reviewed: accs.filter((a) => a.classification_reviewed).length,
      by_type: Object.entries(
        accs.reduce<Record<string, number>>((m, a) => {
          m[a.account_type] = (m[a.account_type] ?? 0) + 1;
          return m;
        }, {}),
      )
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    },
    quality: Object.entries(flagCounts).map(([flag, accounts_count]) => ({ flag, accounts: accounts_count })),
    structure: {
      multi_record_accounts: accs.filter((a) => (a.source_record_count ?? 1) > 1).length,
      multi_group_accounts: accs.filter((a) => (a.relationship_count ?? 0) > 1).length,
    },
    gate: {
      production_import_enabled: false,
      phase: "Phase 2 — Not Yet Available",
      blockers: [
        unresolvedDuplicates > 0
          ? `${unresolvedDuplicates} unresolved duplicate group(s)`
          : null,
        unknownClassifications > 0
          ? `${unknownClassifications} account(s) still classified as unknown`
          : null,
        needsReview > 0 ? `${needsReview} account(s) awaiting review` : null,
      ].filter(Boolean) as string[],
    },
  };
}

export { assertMigrationAdmin };
