import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rawRecordSchema = z.record(z.string(), z.unknown());

const importSchema = z.object({
  batch_name: z.string().min(1).max(120),
  notes: z.string().max(2000).nullable().optional(),
  files: z
    .array(
      z.object({
        source_file: z.string().min(1).max(200),
        records: z.array(rawRecordSchema).max(20000),
      }),
    )
    .min(1)
    .max(20),
});

/** Import (or safely re-import) ResPad source files into the staging layer. */
export const importRespadBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { stageRespadBatch } = await import("./respad.server");
    return stageRespadBatch(context.supabase, context.userId, {
      batch_name: data.batch_name,
      notes: data.notes ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: data.files as any,
    });
  });

export const listRespadBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("respad_migration_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ------------------------------------------------------------------------ */
/* Migration file intake registry (provenance + idempotency)                 */
/* ------------------------------------------------------------------------ */

const fileIntakeSchema = z.object({
  content_hash: z.string().min(8).max(200),
  original_filename: z.string().min(1).max(300),
  file_type: z.string().min(1).max(20),
  mime_type: z.string().max(200).nullable().optional(),
  file_size_bytes: z.number().int().min(0),
  intake_kind: z.enum(["structured", "document"]),
  processing_status: z.string().min(1).max(40),
  detected_row_count: z.number().int().min(0).optional(),
  detected_field_count: z.number().int().min(0).optional(),
  mapped_field_count: z.number().int().min(0).optional(),
  review_field_count: z.number().int().min(0).optional(),
  staged_record_count: z.number().int().min(0).optional(),
  field_mapping: z.unknown().optional(),
  extraction_summary: z.unknown().optional(),
  error_message: z.string().max(2000).nullable().optional(),
  migration_batch_id: z.string().uuid().nullable().optional(),
});

export const recordRespadFileIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fileIntakeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    const { recordFileIntake } = await import("./intake.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return recordFileIntake(context.supabase, context.userId, data);
  });

export const checkRespadFileHash = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ content_hash: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    const { findFileByHash } = await import("./intake.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return findFileByHash(context.supabase, data.content_hash);
  });

export const listRespadMigrationFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    const { listFileIntake } = await import("./intake.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return listFileIntake(context.supabase);
  });

const batchInput = z.object({ batch_id: z.string().uuid() });
const listInput = batchInput.extend({
  search: z.string().max(200).optional(),
  source_file: z.string().max(200).optional(),
  groupname: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

export const getRespadQualityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, buildQualityReport } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return buildQualityReport(context.supabase, data.batch_id);
  });

export const listRespadRawRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    const limit = data.limit ?? 100;
    const offset = data.offset ?? 0;
    let q = context.supabase
      .from("respad_account_staging")
      .select(
        "id, source_file, source_row_index, legacy_company_id, legacy_groupname, legacy_clientname, legacy_email, legacy_telephone, legacy_mobile, legacy_tin, legacy_vrn, legacy_website, legacy_address, legacy_payment_mode, normalized_account_name, normalized_email, normalized_phone, normalized_domain, normalized_tin, normalized_vrn, account_type, normalization_status, duplicate_status, review_status, quality_flags, raw_record",
        { count: "exact" },
      )
      .eq("migration_batch_id", data.batch_id);
    if (data.source_file) q = q.eq("source_file", data.source_file);
    if (data.groupname) q = q.eq("legacy_groupname", data.groupname);
    if (data.search) q = q.ilike("legacy_clientname", `%${data.search}%`);
    const { data: rows, error, count } = await q
      .order("source_file", { ascending: true })
      .order("source_row_index", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listRespadNormalizedAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    const limit = data.limit ?? 200;
    const offset = data.offset ?? 0;
    let q = context.supabase
      .from("respad_normalized_accounts")
      .select("*", { count: "exact" })
      .eq("migration_batch_id", data.batch_id);
    if (data.search) q = q.ilike("account_name", `%${data.search}%`);
    if (data.groupname) q = q.contains("groupnames", [data.groupname]);
    const { data: rows, error, count } = await q
      .order("account_name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listRespadRelationships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("respad_account_relationship_staging")
      .select(
        "id, legacy_groupname, source_file, relationship_type, legacy_company_id, normalized_account_id, respad_normalized_accounts(account_name, account_type)",
      )
      .eq("migration_batch_id", data.batch_id)
      .order("legacy_groupname", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listRespadDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("respad_duplicate_candidates")
      .select(
        "id, duplicate_group_id, confidence, match_signals, match_reason, is_proposed_master, proposed_action, resolution_status, normalized_account_id, respad_normalized_accounts(account_name, emails, phones, tins, vrns, domains, addresses, groupnames, source_files, source_record_count, account_type)",
      )
      .eq("migration_batch_id", data.batch_id)
      .limit(2000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listRespadAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin } = await import("./respad.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("respad_migration_audit_log")
      .select("*")
      .eq("migration_batch_id", data.batch_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
/* ------------------------------------------------------------------------ */
/* Phase 1B — human reconciliation (staging only, no production writes)      */
/* ------------------------------------------------------------------------ */

const reviewStatusEnum = z.enum(["needs_review", "pending", "approved", "rejected", "merged"]);
const accountTypeEnum = z.enum([
  "tour_operator",
  "ota",
  "booking_channel",
  "corporate",
  "organization",
  "direct",
  "other",
  "unknown",
]);

const reviewListInput = batchInput.extend({
  review_status: reviewStatusEnum.optional(),
  account_type: accountTypeEnum.optional(),
  quality_flag: z.string().max(60).optional(),
  search: z.string().max(200).optional(),
  only_multi_record: z.boolean().optional(),
  only_multi_group: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listRespadReviewAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, listReviewAccounts } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return listReviewAccounts(context.supabase, data);
  });

export const getRespadAccountDossier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, getAccountDossier } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return getAccountDossier(context.supabase, data.account_id);
  });

export const listRespadDuplicateGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, listDuplicateGroups } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return listDuplicateGroups(context.supabase, data.batch_id);
  });

export const getRespadReadinessReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, buildReadinessReport } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return buildReadinessReport(context.supabase, data.batch_id);
  });

export const resolveRespadDuplicateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    batchInput
      .extend({
        duplicate_group_id: z.string().uuid(),
        decision: z.enum(["merge", "separate", "needs_review"]),
        canonical_account_id: z.string().uuid().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, resolveDuplicateGroup } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return resolveDuplicateGroup(context.supabase, context.userId, data);
  });

export const setRespadAccountReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        review_status: reviewStatusEnum,
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, setAccountReview } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return setAccountReview(context.supabase, context.userId, data);
  });

export const bulkSetRespadAccountReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    batchInput
      .extend({
        account_ids: z.array(z.string().uuid()).min(1).max(200),
        review_status: reviewStatusEnum,
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, bulkSetAccountReview } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return bulkSetAccountReview(context.supabase, context.userId, data);
  });

export const setRespadAccountClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        account_type: accountTypeEnum,
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, setAccountClassification } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return setAccountClassification(context.supabase, context.userId, data);
  });

export const updateRespadCanonicalAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        patch: z.record(z.string(), z.string().max(500).nullable()),
        contacts: z
          .array(z.object({ email: z.string().max(200), label: z.string().max(80).optional() }))
          .max(20)
          .nullable()
          .optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertMigrationAdmin, updateCanonicalAccount } = await import("./review.server");
    await assertMigrationAdmin(context.supabase, context.userId);
    return updateCanonicalAccount(context.supabase, context.userId, {
      account_id: data.account_id,
      patch: data.patch,
      contacts: data.contacts ?? null,
      notes: data.notes ?? null,
    });
  });
