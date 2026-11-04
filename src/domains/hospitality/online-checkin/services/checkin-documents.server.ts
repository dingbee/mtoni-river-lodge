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
  property_id: string;
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
  // Document operations are available only inside the active, verified wizard
  // session. A token by itself is not sufficient authorisation.
  if (!data.session_id || data.session_id !== sessionId) {
    throw new DocumentRefusal("session", "Verify your reservation before managing documents.");
  }
  const last = Date.parse(data.last_activity_at ?? "") || 0;
  if (!last || Date.now() - last > SESSION_TIMEOUT_MS) {
    throw new DocumentRefusal("session", "Your check-in session timed out. Please verify again.");
  }
  if (data.status !== "in_progress") {
    throw new DocumentRefusal("locked", "Documents can only be changed during an active check-in.");
  }
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("property_id")
    .eq("id", data.booking_id)
    .maybeSingle();
  if (bookingError || !booking?.property_id) {
    throw new DocumentRefusal("invalid", "Unable to resolve the property for this check-in.");
  }
  const { data: eligibility, error: eligibilityError } = await supabaseAdmin
    .rpc("checkin_eligibility", { _booking_id: data.booking_id });
  const eligibilityResult = eligibility as { ok?: boolean } | null;
  if (eligibilityError || !eligibilityResult?.ok) {
    throw new DocumentRefusal("ineligible", "This reservation is no longer eligible for online check-in.");
  }
  return { id: data.id, booking_id: data.booking_id, guest_id: data.guest_id, property_id: booking.property_id };
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
  const matchingType =
    (input.mimeType === "application/pdf" && ext === "pdf") ||
    (input.mimeType === "image/jpeg" && ["jpg", "jpeg"].includes(ext)) ||
    (input.mimeType === "image/png" && ext === "png");
  if (!mimeOk || !extOk || !matchingType) {
    throw new DocumentRefusal("validation", "Use a matching PDF, JPG or PNG file.");
  }

  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.length === 0) throw new DocumentRefusal("validation", "That file appears to be empty.");
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentRefusal("validation", "File is larger than 8 MB.");
  }

  // Do not trust the browser-provided MIME type: verify the actual file signature.
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (
    (input.mimeType === "application/pdf" && !isPdf) ||
    (input.mimeType === "image/jpeg" && !isJpeg) ||
    (input.mimeType === "image/png" && !isPng)
  ) {
    throw new DocumentRefusal("validation", "The selected file does not match its document type.");
  }

  // Preserve the previous document until the replacement has been stored
  // and its metadata row has committed successfully.
  const { data: previous } = await supabaseAdmin
    .from("guest_documents")
    .select("id, storage_path")
    .eq("checkin_id", ctx.id)
    .eq("kind", input.kind);

  const path = `${ctx.booking_id}/${ctx.id}/${input.kind}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) throw new DocumentRefusal("upload_failed", "We could not store that file.");

  const { error: insertError } = await supabaseAdmin.from("guest_documents").insert({
    checkin_id: ctx.id,
    booking_id: ctx.booking_id,
    guest_id: ctx.guest_id,
    property_id: ctx.property_id,
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

  // Clean up superseded copies only after the new document is safely recorded.
  const stalePaths = (previous ?? []).map((r) => r.storage_path).filter(Boolean) as string[];
  const staleIds = (previous ?? []).map((r) => r.id);
  if (stalePaths.length) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(stalePaths);
    if (error) console.warn("[checkin-documents] stale file cleanup failed", error.message);
  }
  if (staleIds.length) {
    const { error } = await supabaseAdmin.from("guest_documents").delete().in("id", staleIds);
    if (error) console.warn("[checkin-documents] stale metadata cleanup failed", error.message);
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
