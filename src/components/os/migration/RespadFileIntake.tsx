import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SectionCard } from "@/components/os/SectionCard";
import {
  importRespadBatch,
  listRespadMigrationFiles,
  recordRespadFileIntake,
} from "@/domains/migration/respad/respad.functions";
import { extractFile } from "@/domains/migration/respad/intake/extract.client";
import { buildMappingPlan, RESPAD_FIELDS, rowsToRecords } from "@/domains/migration/respad/intake/fieldMap";
import {
  INTAKE_STATUS_LABEL,
  SUPPORTED_INTAKE_FORMATS,
  type ExtractedFile,
} from "@/domains/migration/respad/intake/types";

const ACCEPT = SUPPORTED_INTAKE_FORMATS.map((f) => `.${f}`).join(",");

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready_for_staging: "default",
  staged: "default",
  needs_mapping: "secondary",
  needs_review: "secondary",
  duplicate: "outline",
  failed: "destructive",
};

export function RespadFileIntake({
  batchName,
  onBatchStaged,
}: {
  batchName: string;
  onBatchStaged: (batchId: string) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const registerFn = useServerFn(recordRespadFileIntake);
  const importFn = useServerFn(importRespadBatch);
  const listFn = useServerFn(listRespadMigrationFiles);
  const history = useQuery({ queryKey: ["respad", "files"], queryFn: () => listFn() });

  async function onPick(list: FileList) {
    setBusy(true);
    const next: ExtractedFile[] = [];
    for (const file of Array.from(list)) {
      const extracted = await extractFile(file);
      const already = ((history.data as Record<string, unknown>[]) ?? []).find(
        (h) => h.content_hash === extracted.contentHash,
      );
      const final: ExtractedFile =
        already && extracted.status !== "failed"
          ? {
              ...extracted,
              notes: [
                ...extracted.notes,
                `Identical content already processed as "${already.original_filename}" — re-processing is idempotent.`,
              ],
            }
          : extracted;
      next.push(final);
      try {
        await registerFn({
          data: {
            content_hash: final.contentHash,
            original_filename: final.filename,
            file_type: final.fileType,
            mime_type: final.mimeType,
            file_size_bytes: final.sizeBytes,
            intake_kind: final.kind,
            processing_status: final.status,
            detected_row_count: final.detectedRowCount,
            detected_field_count: final.headers.length,
            mapped_field_count: final.mapping.filter((m) => m.status === "mapped").length,
            review_field_count: final.mapping.filter((m) => m.status === "needs_review").length,
            field_mapping: final.mapping,
            extraction_summary: { notes: final.notes, sheets: final.sheetNames ?? null },
            error_message: final.error ?? null,
          },
        });
      } catch (e) {
        toast.error(`Could not record intake for ${final.filename}: ${(e as Error).message}`);
      }
    }
    setFiles((prev) => [...next, ...prev.filter((p) => !next.some((n) => n.id === p.id))]);
    qc.invalidateQueries({ queryKey: ["respad", "files"] });
    setBusy(false);
    const failed = next.filter((f) => f.status === "failed").length;
    toast[failed ? "warning" : "success"](
      `${next.length - failed} file(s) extracted${failed ? `, ${failed} failed` : ""}`,
    );
  }

  function remap(fileId: string, header: string, target: string | null) {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const overrides: Record<string, string | null> = {};
        for (const m of f.mapping) {
          if (m.status === "mapped" && m.target) overrides[m.header] = m.target;
          if (m.status === "ignored") overrides[m.header] = null;
        }
        overrides[header] = target;
        const plan = buildMappingPlan(f.headers, overrides);
        const rows = f.rawRows ?? f.sample;
        return {
          ...f,
          mapping: plan.mapping,
          records: rowsToRecords(rows, plan.mapping),
          status: plan.hasIdentity && plan.reviewCount === 0 ? "ready_for_staging" : "needs_mapping",
        };
      }),
    );
  }

  const stageable = files.filter((f) => f.status === "ready_for_staging" && f.records.length);

  const stage = useMutation({
    mutationFn: async () => {
      const res = (await importFn({
        data: {
          batch_name: batchName,
          notes: null,
          files: stageable.map((f) => ({ source_file: f.filename, records: f.records })),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      for (const f of stageable) {
        await registerFn({
          data: {
            content_hash: f.contentHash,
            original_filename: f.filename,
            file_type: f.fileType,
            mime_type: f.mimeType,
            file_size_bytes: f.sizeBytes,
            intake_kind: f.kind,
            processing_status: "staged",
            detected_row_count: f.detectedRowCount,
            detected_field_count: f.headers.length,
            mapped_field_count: f.mapping.filter((m) => m.status === "mapped").length,
            review_field_count: f.mapping.filter((m) => m.status === "needs_review").length,
            staged_record_count: f.records.length,
            field_mapping: f.mapping,
            extraction_summary: { notes: f.notes },
            migration_batch_id: res.batch_id,
          },
        });
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        `Staged ${res.staged_record_count} records → ${res.normalized_account_count} account candidates`,
      );
      setFiles((prev) =>
        prev.map((f) => (f.status === "ready_for_staging" ? { ...f, status: "staged" } : f)),
      );
      onBatchStaged(res.batch_id);
      qc.invalidateQueries({ queryKey: ["respad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <SectionCard
        title="Migration file intake"
        description={`Accepted: ${SUPPORTED_INTAKE_FORMATS.join(", ").toUpperCase()}. Files are read in your browser; only extracted records reach the staging layer.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-2 size-4" />
              {busy ? "Extracting…" : "Choose files"}
            </Button>
            <Button onClick={() => stage.mutate()} disabled={!stageable.length || stage.isPending}>
              {stage.isPending ? "Staging…" : `Stage ${stageable.length || ""} file(s)`}
            </Button>
          </div>
        }
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void onPick(e.target.files);
            e.target.value = "";
          }}
        />
        {!files.length ? (
          <p className="text-sm text-muted-foreground">
            No files selected yet. Spreadsheets and CSVs are mapped column-by-column; documents are
            extracted for review and never staged automatically.
          </p>
        ) : (
          <div className="space-y-3">
            {files.map((f) => (
              <div key={f.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-medium">{f.filename}</span>
                  <Badge variant="outline">{f.fileType.toUpperCase()}</Badge>
                  <Badge variant={STATUS_VARIANT[f.status] ?? "secondary"}>
                    {INTAKE_STATUS_LABEL[f.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(f.sizeBytes / 1024).toFixed(0)} KB · {f.detectedRowCount} row(s) ·{" "}
                    {f.headers.length} column(s)
                  </span>
                </div>

                {f.error && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertTitle>Extraction failed</AlertTitle>
                    <AlertDescription>{f.error}</AlertDescription>
                  </Alert>
                )}

                {f.notes.map((n) => (
                  <p key={n} className="mt-2 text-xs text-muted-foreground">
                    {n}
                  </p>
                ))}

                {f.mapping.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {f.mapping.map((m) => (
                      <label key={m.header} className="text-xs">
                        <span className="block truncate text-muted-foreground" title={m.header}>
                          {m.header}
                          {m.reason ? ` — ${m.reason}` : ""}
                        </span>
                        <select
                          className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
                          value={m.status === "ignored" ? "__ignore" : (m.target ?? "")}
                          onChange={(e) =>
                            remap(
                              f.id,
                              m.header,
                              e.target.value === "__ignore" || e.target.value === "" ? null : e.target.value,
                            )
                          }
                        >
                          <option value="">Needs review</option>
                          {RESPAD_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                          <option value="__ignore">Ignore column</option>
                        </select>
                      </label>
                    ))}
                  </div>
                )}

                {f.textPreview && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Extracted text preview
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                      {f.textPreview}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Intake history" description="Every file processed for this migration, with provenance.">
        {!((history.data as Record<string, unknown>[]) ?? []).length ? (
          <p className="text-sm text-muted-foreground">No files recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {["File", "Type", "Status", "Rows", "Staged", "Uploaded"].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((history.data as Record<string, any>[]) ?? []).map((r) => (
                  <tr key={r.id as string} className="border-b border-border/50">
                    <td className="py-2 pr-4">{r.original_filename}</td>
                    <td className="py-2 pr-4">{String(r.file_type).toUpperCase()}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_VARIANT[r.processing_status] ?? "secondary"}>
                        {INTAKE_STATUS_LABEL[r.processing_status as keyof typeof INTAKE_STATUS_LABEL] ??
                          r.processing_status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{r.detected_row_count}</td>
                    <td className="py-2 pr-4">{r.staged_record_count}</td>
                    <td className="py-2 pr-4">{new Date(r.uploaded_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}