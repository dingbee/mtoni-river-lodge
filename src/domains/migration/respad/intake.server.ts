/**
 * Migration file intake registry (server-only).
 *
 * Provenance + idempotency bookkeeping for uploaded migration files. Touches
 * only `respad_migration_files` and the existing migration audit log — never
 * any production table.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type FileIntakeInput = {
  content_hash: string;
  original_filename: string;
  file_type: string;
  mime_type?: string | null;
  file_size_bytes: number;
  intake_kind: string;
  processing_status: string;
  detected_row_count?: number;
  detected_field_count?: number;
  mapped_field_count?: number;
  review_field_count?: number;
  staged_record_count?: number;
  field_mapping?: unknown;
  extraction_summary?: unknown;
  error_message?: string | null;
  migration_batch_id?: string | null;
};

export async function findFileByHash(supabase: Sb, hash: string) {
  const { data, error } = await supabase
    .from("respad_migration_files")
    .select("*")
    .eq("source_system", "ResPad")
    .eq("content_hash", hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function recordFileIntake(supabase: Sb, userId: string, input: FileIntakeInput) {
  const previous = await findFileByHash(supabase, input.content_hash);
  const row = {
    source_system: "ResPad",
    content_hash: input.content_hash,
    original_filename: input.original_filename,
    file_type: input.file_type,
    mime_type: input.mime_type ?? null,
    file_size_bytes: input.file_size_bytes,
    intake_kind: input.intake_kind,
    processing_status: input.processing_status,
    detected_row_count: input.detected_row_count ?? 0,
    detected_field_count: input.detected_field_count ?? 0,
    mapped_field_count: input.mapped_field_count ?? 0,
    review_field_count: input.review_field_count ?? 0,
    staged_record_count: input.staged_record_count ?? 0,
    field_mapping: input.field_mapping ?? [],
    extraction_summary: input.extraction_summary ?? {},
    error_message: input.error_message ?? null,
    migration_batch_id: input.migration_batch_id ?? null,
    processed_by: userId,
  };
  const { data, error } = await supabase
    .from("respad_migration_files")
    .upsert(row, { onConflict: "source_system,content_hash" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("respad_migration_audit_log").insert({
    migration_batch_id: input.migration_batch_id ?? null,
    action: `intake.${input.processing_status}`,
    phase: "intake",
    actor_id: userId,
    target_id: data.id,
    detail: {
      filename: input.original_filename,
      file_type: input.file_type,
      rows: input.detected_row_count ?? 0,
      fields: input.detected_field_count ?? 0,
      fields_needing_review: input.review_field_count ?? 0,
      reprocessed: Boolean(previous),
    },
  });

  return { file: data, previously_processed: Boolean(previous), previous };
}

export async function listFileIntake(supabase: Sb) {
  const { data, error } = await supabase
    .from("respad_migration_files")
    .select("*, respad_migration_batches(batch_name)")
    .order("uploaded_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}