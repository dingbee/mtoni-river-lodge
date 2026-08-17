/**
 * Browser-side migration file extraction.
 *
 * Files are read and extracted entirely in the reviewer's browser — nothing is
 * uploaded to storage and no privileged credential is involved. Only the
 * extracted, normalized records are sent to the existing staging server
 * function, which continues to enforce the owner/manager gate.
 */
import type { RespadRawRecord } from "../normalize";
import { gridToTable, parseDelimited } from "./csv";
import { buildMappingPlan, rowsToRecords } from "./fieldMap";
import {
  MAX_INTAKE_FILE_BYTES,
  SUPPORTED_INTAKE_FORMATS,
  type ExtractedFile,
  type IntakeFileType,
} from "./types";

export function detectFileType(name: string): IntakeFileType | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return (SUPPORTED_INTAKE_FORMATS as readonly string[]).includes(ext)
    ? (ext as IntakeFileType)
    : null;
}

async function sha256(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base(file: File, fileType: IntakeFileType, hash: string): ExtractedFile {
  return {
    id: `${file.name}:${hash.slice(0, 12)}`,
    filename: file.name,
    fileType,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    contentHash: hash,
    kind: fileType === "json" || fileType === "csv" || fileType === "xlsx" ? "structured" : "document",
    status: "processing",
    notes: [],
    headers: [],
    mapping: [],
    detectedRowCount: 0,
    records: [],
    sample: [],
  };
}

function fail(f: ExtractedFile, message: string): ExtractedFile {
  return { ...f, status: "failed", error: message };
}

/** Extract a single file into an intermediate representation for review. */
export async function extractFile(file: File): Promise<ExtractedFile> {
  const fileType = detectFileType(file.name);
  const buf = await file.arrayBuffer().catch(() => null);
  if (!buf) {
    const hash = `unreadable:${file.name}:${file.size}`;
    return fail(base(file, (fileType ?? "txt") as IntakeFileType, hash), "File could not be read (corrupt or locked).");
  }
  const hash = await sha256(buf);

  if (!fileType) {
    return fail(
      base(file, "txt", hash),
      `Unsupported file type. Supported formats: ${SUPPORTED_INTAKE_FORMATS.join(", ").toUpperCase()}.`,
    );
  }
  const f = base(file, fileType, hash);
  if (file.size === 0) return fail(f, "File is empty (0 bytes).");
  if (file.size > MAX_INTAKE_FILE_BYTES)
    return fail(f, `File is too large (${(file.size / 1048576).toFixed(1)} MB, limit 25 MB).`);

  try {
    switch (fileType) {
      case "json":
        return finishStructured(f, await extractJson(buf), true);
      case "csv":
        return finishStructured(f, extractCsv(buf), false);
      case "xlsx":
        return finishStructured(f, await extractXlsx(buf, f), false);
      case "pdf":
        return finishDocument(f, await extractPdf(buf));
      case "docx":
        return finishDocument(f, await extractDocx(buf));
      case "doc":
        return finishDocument(f, extractLegacyDoc(buf));
      case "txt":
        return finishDocument(f, new TextDecoder().decode(buf));
    }
  } catch (e) {
    return fail(f, e instanceof Error ? e.message : "Extraction failed.");
  }
}

/* ------------------------------------------------------------ structured */

type Extracted = { headers: string[]; rows: Record<string, unknown>[]; records?: RespadRawRecord[]; notes?: string[]; sheetNames?: string[] };

async function extractJson(buf: ArrayBuffer): Promise<Extracted> {
  const text = new TextDecoder().decode(buf).trim();
  if (!text) throw new Error("File is empty.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
  }
  const container = parsed as Record<string, unknown>;
  const records = (
    Array.isArray(parsed)
      ? parsed
      : Array.isArray(container?.data)
        ? container.data
        : Array.isArray(container?.records)
          ? container.records
          : [parsed]
  ) as RespadRawRecord[];
  if (!records.length) throw new Error("No records found in JSON payload.");
  const headers = [...new Set(records.flatMap((r) => Object.keys(r ?? {})))];
  return { headers, rows: records as Record<string, unknown>[], records };
}

function extractCsv(buf: ArrayBuffer): Extracted {
  const text = new TextDecoder().decode(buf);
  if (!text.trim()) throw new Error("CSV file is empty.");
  const { rows: grid, delimiter } = parseDelimited(text);
  if (grid.length < 2) throw new Error("CSV has a header row but no data rows.");
  const widths = new Set(grid.map((r) => r.length));
  const table = gridToTable(grid);
  const notes: string[] = [`Delimiter detected: ${delimiter === "\t" ? "tab" : delimiter}`];
  if (widths.size > 1) notes.push("Malformed CSV: rows have inconsistent column counts — short rows padded, extras preserved.");
  return { ...table, notes };
}

async function extractXlsx(buf: ArrayBuffer, f: ExtractedFile): Promise<Extracted> {
  const XLSX = await import("xlsx");
  let wb;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch (e) {
    throw new Error(
      `Workbook could not be opened (corrupt or password protected): ${e instanceof Error ? e.message : "read error"}`,
    );
  }
  const sheetNames = wb.SheetNames ?? [];
  if (!sheetNames.length) throw new Error("Workbook contains no sheets.");
  const sheet = wb.Sheets[sheetNames[0]!];
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet!, { header: 1, raw: false, defval: "" });
  const cleaned = (grid as unknown[][]).map((r) => (r ?? []).map((c) => (c == null ? "" : String(c))));
  if (cleaned.length < 2) throw new Error(`Sheet "${sheetNames[0]}" has no data rows.`);
  const table = gridToTable(cleaned);
  const notes = [`Sheet used: ${sheetNames[0]}`];
  if (sheetNames.length > 1)
    notes.push(`${sheetNames.length - 1} further sheet(s) ignored: ${sheetNames.slice(1).join(", ")}`);
  void f;
  return { ...table, notes, sheetNames };
}

function finishStructured(f: ExtractedFile, ex: Extracted, isJson: boolean): ExtractedFile {
  if (!ex.rows.length) return fail(f, "No data rows were extracted.");
  const plan = buildMappingPlan(ex.headers);
  const records = ex.records ?? rowsToRecords(ex.rows, plan.mapping);
  const ready = isJson || (plan.hasIdentity && plan.reviewCount === 0);
  return {
    ...f,
    headers: ex.headers,
    mapping: isJson ? plan.mapping.map((m) => ({ ...m, status: m.target ? "mapped" : m.status })) : plan.mapping,
    detectedRowCount: ex.rows.length,
    records,
    sample: ex.rows.slice(0, 8),
    rawRows: ex.rows,
    notes: [...(ex.notes ?? []), ...(isJson ? ["Native ResPad JSON — existing pipeline, no mapping required."] : [])],
    sheetNames: ex.sheetNames,
    status: ready ? "ready_for_staging" : "needs_mapping",
  };
}

/* -------------------------------------------------------------- documents */

async function extractPdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = pdfjs as any;
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  lib.GlobalWorkerOptions.workerSrc = workerSrc;
  let doc;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "read error";
    throw new Error(
      /password/i.test(msg)
        ? "PDF is password protected — extraction is not possible. Provide an unlocked copy."
        : `PDF could not be opened (corrupt or unsupported): ${msg}`,
    );
  }
  const parts: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 50); p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parts.push((content.items as any[]).map((i) => i.str ?? "").join(" "));
  }
  const text = parts.join("\n");
  if (!text.replace(/\s/g, "").length)
    throw new Error("PDF contains no extractable text (likely a scan). OCR is not available in this intake.");
  return text;
}

async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (mammoth as any).extractRawText({ arrayBuffer: buf });
  const text = String(res?.value ?? "");
  if (!text.trim()) throw new Error("DOCX contains no extractable text.");
  return text;
}

function extractLegacyDoc(buf: ArrayBuffer): string {
  // Legacy binary .doc: best-effort printable-run recovery.
  const bytes = new Uint8Array(buf);
  let out = "";
  let run = "";
  for (const b of bytes) {
    if ((b >= 32 && b < 127) || b === 10 || b === 13 || b === 9) run += String.fromCharCode(b);
    else {
      if (run.trim().length > 4) out += run + "\n";
      run = "";
    }
  }
  if (run.trim().length > 4) out += run;
  const text = out.replace(/[ \t]{2,}/g, " ").trim();
  if (text.length < 40)
    throw new Error(
      "Legacy .doc could not be read reliably (binary or password protected). Re-save it as .docx, .csv or .xlsx.",
    );
  return text;
}

/** Detect a delimited table inside plain document text (tab or pipe separated). */
function documentTable(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const d of ["\t", "|", ";"]) {
    const candidates = lines.filter((l) => l.split(d).length > 2);
    if (candidates.length >= 3) {
      const grid = candidates.map((l) => l.split(d).map((c) => c.trim()));
      return gridToTable(grid);
    }
  }
  return null;
}

function finishDocument(f: ExtractedFile, text: string): ExtractedFile {
  const preview = text.slice(0, 4000);
  const table = documentTable(text);
  if (!table || table.rows.length === 0) {
    return {
      ...f,
      status: "needs_review",
      textPreview: preview,
      detectedRowCount: 0,
      notes: [
        "Document source — no reliable table structure detected. Content is extracted for review only and cannot be staged automatically.",
      ],
    };
  }
  const plan = buildMappingPlan(table.headers);
  return {
    ...f,
    headers: table.headers,
    mapping: plan.mapping,
    detectedRowCount: table.rows.length,
    records: rowsToRecords(table.rows, plan.mapping),
    sample: table.rows.slice(0, 8),
    rawRows: table.rows,
    textPreview: preview,
    status: "needs_review",
    notes: [
      "Document source — a candidate table was detected. Confidence is insufficient for automatic staging; confirm the mapping before staging.",
    ],
  };
}