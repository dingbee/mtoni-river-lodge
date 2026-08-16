import type { RespadRawRecord } from "../normalize";

export const SUPPORTED_INTAKE_FORMATS = [
  "json",
  "csv",
  "xlsx",
  "pdf",
  "docx",
  "doc",
  "txt",
] as const;

export type IntakeFileType = (typeof SUPPORTED_INTAKE_FORMATS)[number];

/** Max accepted file size for browser-side extraction. */
export const MAX_INTAKE_FILE_BYTES = 25 * 1024 * 1024;

export type IntakeKind = "structured" | "document";

/**
 * Lifecycle of a migration file. These states are deliberately distinct:
 * uploaded ≠ extracted ≠ staged ≠ reconciled ≠ approved ≠ imported.
 */
export type IntakeStatus =
  | "uploaded"
  | "processing"
  | "extracted"
  | "needs_mapping"
  | "needs_review"
  | "ready_for_staging"
  | "staged"
  | "duplicate"
  | "failed";

export type FieldMappingConfidence = "high" | "medium" | "none";

export type FieldMapping = {
  header: string;
  target: string | null;
  confidence: FieldMappingConfidence;
  status: "mapped" | "needs_review" | "ignored";
  reason?: string;
};

export type ExtractedFile = {
  id: string;
  filename: string;
  fileType: IntakeFileType;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  kind: IntakeKind;
  status: IntakeStatus;
  error?: string;
  notes: string[];
  headers: string[];
  mapping: FieldMapping[];
  detectedRowCount: number;
  records: RespadRawRecord[];
  sample: Record<string, unknown>[];
  /** Full extracted tabular rows, retained so mapping can be re-applied. */
  rawRows?: Record<string, unknown>[];
  textPreview?: string;
  sheetNames?: string[];
};

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  extracted: "Extracted",
  needs_mapping: "Needs mapping",
  needs_review: "Needs review",
  ready_for_staging: "Ready for staging",
  staged: "Staged",
  duplicate: "Already processed",
  failed: "Failed",
};