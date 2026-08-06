/**
 * Online Check-In — server-only document handling.
 * Guests are anonymous, so every call is authorised by the check-in token plus
 * the wizard session id before any privileged storage or database access.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ALLOWED_DOCUMENT_EXT,
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
  type CheckInDocumentKind,
  type GuestDocumentView,
} from "./documents-shared";

const BUCKET = "guest-documents";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export class DocumentRefusal extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DocumentRefusal";
    this.code = code;
  }
}

interface CheckInContext {
  id: string;
  booking_id: string;
  guest_id: string | null;
}

async function authorise(token: string, sessionId: string): Promise<CheckInContext> {
  const { data, error } = await supabaseAdmin
    .from("guest_checkins")
    .select("id, booking_id, guest_id, status, locked_at, expires_at, session_id, last_activity_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new DocumentRefusal("invalid", "Unable to load this check-in link");
  if (!data) throw new DocumentRefusal("invalid", "Invalid check-in link");
  if (data.locked_at || ["submitted", "under_review", "approved"].includes(data.status)) {
    throw new DocumentRefusal("locked", "This check-in has already been submitted");
  }
  if (Date.parse(data.expires_at) <= Date.now()) {
    throw new DocumentRefusal("expired", "This check-in link has expired");
  }
  if (data.session_id && data.session_id !== sessionId) {
    throw new DocumentRefusal("session", "Your check-in session is no longer active");
  }
  const last = Date.parse(data.last_activity_at ?? "") || 0;
  if (last && Date.now() - last > SESSION_TIMEOUT_MS) {
    throw new DocumentRefusal("session", "Your check-in session timed out. Please verify again.");
  }
  return { id: data.id, booking_id: data.booking_id, guest_id: data.guest_id };
}

async function touch(checkinId: string) {
  await supabaseAdmin
    .from("guest_checkins")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", checkinId);
}

async function logActivity(
  ctx: CheckInContext,
  action: string,
  sessionId: string,
  detail: Record<string, unknown>,
) {
  await supabaseAdmin.from("guest_checkin_activity").insert({
    checkin_id: ctx.id,
    booking_id: ctx.booking_id,
    action,
    session_id: sessionId,
    detail: detail as never,
  });
}

const SELECT_COLUMNS =
  "id, kind, file_name, mime_type, file_size, status, rejection_reason, document_number, document_expiry, created_at";

export async function listDocuments(input: {
  token: string;
  sessionId: string;
}): Promise<GuestDocumentView[]> {
  const ctx = await authorise(input.token, input.sessionId);
  const { data, error } = await supabaseAdmin
    .from("guest_documents")
    .select(SELECT_COLUMNS)
    .eq("checkin_id", ctx.id)
    .order("created_at", { ascending: true });
  if (error) throw new DocumentRefusal("invalid", "Unable to load your documents");
  return (data ?? []) as GuestDocumentView[];
}

export async function uploadDocument(input: {
  token: string;
  sessionId: string;
  kind: CheckInDocumentKind;
  fileName: string;
  mimeType: string;
  size: number;
  contentBase64: string;
  documentNumber?: string;
  documentExpiry?: string;
}): Promise<GuestDocumentView[]> {
  const ctx = await authorise(input.token, input.sessionId);

  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const mimeOk = (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(input.mimeType);
  const extOk = (ALLOWED_DOCUMENT_EXT as readonly string[]).includes(ext);
  if (!mimeOk || !extOk) {
    throw new DocumentRefusal("validation", "Use a PDF, JPG or PNG file.");
  }

  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.length === 0) throw new DocumentRefusal("validation", "That file appears to be empty.");
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentRefusal("validation", "File is larger than 8 MB.");
  }

  // Replace: drop any previous document of the same kind for this check-in.
  const { data: previous } = await supabaseAdmin
    .from("guest_documents")
    .select("id, storage_path")
    .eq("checkin_id", ctx.id)
    .eq("kind", input.kind);
  const stalePaths = (previous ?? []).map((r) => r.storage_path).filter(Boolean) as string[];
  if (stalePaths.length) await supabaseAdmin.storage.from(BUCKET).remove(stalePaths);
  if (previous?.length) {
    await supabaseAdmin
      .from("guest_documents")
      .delete()
      .in(
        "id",
        previous.map((r) => r.id),
      );
  }

  const path = `${ctx.booking_id}/${ctx.id}/${input.kind}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) throw new DocumentRefusal("upload_failed", "We could not store that file.");

  const { error: insertError } = await supabaseAdmin.from("guest_documents").insert({
    checkin_id: ctx.id,
    booking_id: ctx.booking_id,
    guest_id: ctx.guest_id,
    kind: input.kind,
    label: input.fileName,
    file_name: input.fileName,
    file_size: bytes.length,
    mime_type: input.mimeType,
    storage_path: path,
    status: "pending",
    uploaded_by_guest: true,
    document_number: input.documentNumber?.trim() || null,
    document_expiry: input.documentExpiry?.trim() || null,
  });
  if (insertError) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    throw new DocumentRefusal("upload_failed", "We could not save that document.");
  }

  await touch(ctx.id);
  await logActivity(ctx, "document_uploaded", input.sessionId, { kind: input.kind });
  return listDocumentsForContext(ctx.id);
}

async function listDocumentsForContext(checkinId: string): Promise<GuestDocumentView[]> {
  const { data } = await supabaseAdmin
    .from("guest_documents")
    .select(SELECT_COLUMNS)
    .eq("checkin_id", checkinId)
    .order("created_at", { ascending: true });
  return (data ?? []) as GuestDocumentView[];
}

export async function removeDocument(input: {
  token: string;
  sessionId: string;
  documentId: string;
}): Promise<GuestDocumentView[]> {
  const ctx = await authorise(input.token, input.sessionId);
  const { data: row } = await supabaseAdmin
    .from("guest_documents")
    .select("id, storage_path, kind")
    .eq("id", input.documentId)
    .eq("checkin_id", ctx.id)
    .maybeSingle();
  if (!row) throw new DocumentRefusal("invalid", "Document not found");
  if (row.storage_path) await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
  await supabaseAdmin.from("guest_documents").delete().eq("id", row.id);
  await touch(ctx.id);
  await logActivity(ctx, "document_removed", input.sessionId, { kind: row.kind });
  return listDocumentsForContext(ctx.id);
}

export async function previewDocument(input: {
  token: string;
  sessionId: string;
  documentId: string;
}): Promise<{ url: string }> {
  const ctx = await authorise(input.token, input.sessionId);
  const { data: row } = await supabaseAdmin
    .from("guest_documents")
    .select("storage_path")
    .eq("id", input.documentId)
    .eq("checkin_id", ctx.id)
    .maybeSingle();
  if (!row?.storage_path) throw new DocumentRefusal("invalid", "Document not found");
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 300);
  if (error || !data?.signedUrl) {
    throw new DocumentRefusal("invalid", "Preview is unavailable right now");
  }
  return { url: data.signedUrl };
}