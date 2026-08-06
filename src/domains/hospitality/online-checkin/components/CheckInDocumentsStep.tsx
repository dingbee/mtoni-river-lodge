import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listCheckInDocuments,
  previewCheckInDocument,
  removeCheckInDocument,
  uploadCheckInDocument,
} from "../services/checkin-documents.functions";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_HINT,
  DOCUMENT_KIND_LABEL,
  formatBytes,
  validateDocumentFile,
  type CheckInDocumentKind,
  type GuestDocumentView,
} from "../services/documents-shared";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function statusBadge(status: string) {
  if (status === "verified") return <Badge className="bg-primary/15 text-primary">Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Needs replacing</Badge>;
  return <Badge variant="secondary">Awaiting review</Badge>;
}

export function CheckInDocumentsStep({
  token,
  sessionId,
  onDocumentsChange,
  onBack,
  onContinue,
}: {
  token: string;
  sessionId: string;
  onDocumentsChange?: (docs: GuestDocumentView[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const list = useServerFn(listCheckInDocuments);
  const upload = useServerFn(uploadCheckInDocument);
  const remove = useServerFn(removeCheckInDocument);
  const preview = useServerFn(previewCheckInDocument);

  const [docs, setDocs] = useState<GuestDocumentView[]>([]);
  const [busyKind, setBusyKind] = useState<CheckInDocumentKind | null>(null);
  const [progress, setProgress] = useState(0);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const query = useQuery({
    queryKey: ["checkin-documents", token],
    queryFn: () => list({ data: { token, sessionId } }),
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setDocs(query.data as GuestDocumentView[]);
      onDocumentsChange?.(query.data as GuestDocumentView[]);
    }
  }, [query.data, onDocumentsChange]);

  const uploadMutation = useMutation({
    mutationFn: async ({ kind, file }: { kind: CheckInDocumentKind; file: File }) => {
      const contentBase64 = await readAsBase64(file);
      setProgress(60);
      return upload({
        data: {
          token,
          sessionId,
          kind,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          contentBase64,
        },
      });
    },
    onSuccess: (next) => {
      setProgress(100);
      setDocs(next as GuestDocumentView[]);
      onDocumentsChange?.(next as GuestDocumentView[]);
      toast.success("Document uploaded");
    },
    onError: (err: Error) => toast.error(err.message || "Upload failed"),
    onSettled: () => {
      setBusyKind(null);
      window.setTimeout(() => setProgress(0), 600);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (documentId: string) => remove({ data: { token, sessionId, documentId } }),
    onSuccess: (next) => {
      setDocs(next as GuestDocumentView[]);
      onDocumentsChange?.(next as GuestDocumentView[]);
      toast.success("Document removed");
    },
    onError: (err: Error) => toast.error(err.message || "Could not remove that document"),
  });

  async function openPreview(documentId: string) {
    try {
      const res = await preview({ data: { token, sessionId, documentId } });
      window.open((res as { url: string }).url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview unavailable");
    }
  }

  function pick(kind: CheckInDocumentKind, file: File | null | undefined) {
    if (!file) return;
    const problem = validateDocumentFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusyKind(kind);
    setProgress(20);
    uploadMutation.mutate({ kind, file });
  }

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a clear photo or PDF of your identity documents. Files are stored privately and are
        only visible to our reception team. PDF, JPG or PNG, up to 8 MB each.
      </p>

      {DOCUMENT_KINDS.map((kind) => {
        const doc = docs.find((d) => d.kind === kind);
        const busy = busyKind === kind;
        return (
          <div key={kind} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {DOCUMENT_KIND_LABEL[kind]}
                  {kind === "visa" && (
                    <span className="ml-2 text-xs text-muted-foreground">Optional</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{DOCUMENT_KIND_HINT[kind]}</p>
              </div>
              {doc && statusBadge(doc.status)}
            </div>

            {doc ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{doc.file_name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(doc.file_size)}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void openPreview(doc.id)}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => inputs.current[kind]?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(doc.id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => inputs.current[kind]?.click()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload {DOCUMENT_KIND_LABEL[kind].toLowerCase()}
              </Button>
            )}

            {doc?.status === "rejected" && doc.rejection_reason && (
              <p className="mt-2 text-xs text-destructive">
                Reception asked for a new copy: {doc.rejection_reason}
              </p>
            )}

            {busy && progress > 0 && <Progress value={progress} className="mt-3 h-1.5" />}

            <input
              ref={(el) => {
                inputs.current[kind] = el;
              }}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              aria-label={`Upload ${DOCUMENT_KIND_LABEL[kind]}`}
              onChange={(e) => {
                pick(kind, e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        );
      })}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue}>Review</Button>
      </div>
    </div>
  );
}
