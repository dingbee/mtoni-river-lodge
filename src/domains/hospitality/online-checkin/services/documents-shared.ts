/**
 * Online Check-In — document constants and validation shared by the guest
 * wizard, the staff review screen and the server functions.
 */
import { z } from "zod";

export const DOCUMENT_KINDS = ["passport", "national_id", "visa"] as const;
export type CheckInDocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<CheckInDocumentKind, string> = {
  passport: "Passport",
  national_id: "National ID",
  visa: "Visa",
};

export const DOCUMENT_KIND_HINT: Record<CheckInDocumentKind, string> = {
  passport: "Required for international guests — photo page.",
  national_id: "Accepted instead of a passport for residents.",
  visa: "Optional — upload if your visa is already issued.",
};

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;
export const ALLOWED_DOCUMENT_EXT = ["pdf", "jpg", "jpeg", "png"] as const;

export function formatBytes(size: number | null | undefined): string {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side pre-flight check; the server repeats these rules. */
export function validateDocumentFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeOk = (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(file.type);
  const extOk = (ALLOWED_DOCUMENT_EXT as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) return "Use a PDF, JPG or PNG file.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File is larger than 8 MB.";
  if (file.size === 0) return "That file appears to be empty.";
  return null;
}

export const documentSessionSchema = z.object({
  token: z.string().min(16).max(200),
  sessionId: z.string().min(8).max(120),
});

export const documentUploadSchema = documentSessionSchema.extend({
  kind: z.enum(DOCUMENT_KINDS),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  contentBase64: z.string().min(8),
  documentNumber: z.string().trim().max(60).optional().or(z.literal("")),
  documentExpiry: z.string().trim().max(20).optional().or(z.literal("")),
});

export const documentIdSchema = documentSessionSchema.extend({
  documentId: z.string().uuid(),
});

export interface GuestDocumentView {
  id: string;
  kind: CheckInDocumentKind;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  rejection_reason: string | null;
  document_number: string | null;
  document_expiry: string | null;
  created_at: string;
}
