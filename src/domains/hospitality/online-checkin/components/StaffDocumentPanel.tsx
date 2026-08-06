import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import {
  DOCUMENT_KIND_LABEL,
  formatBytes,
  type CheckInDocumentKind,
} from "../services/documents-shared";

interface StaffDocumentRow {
  id: string;
  kind: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  rejection_reason: string | null;
  document_expiry: string | null;
  storage_path: string | null;
  created_at: string;
  verified_at: string | null;
}

function badge(status: string) {
  if (status === "verified") return <Badge className="bg-primary/15 text-primary">Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export function StaffDocumentPanel({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["staff-checkin-documents", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select(
          "id, kind, file_name, file_size, mime_type, status, rejection_reason, document_expiry, storage_path, created_at, verified_at",
        )
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffDocumentRow[];
    },
  });

  const setStatus = useAdminMutation({
    mutationFn: async (vars: { id: string; status: "pending" | "verified" | "rejected" }) => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("guest_documents")
        .update({
          status: vars.status,
          rejection_reason: vars.status === "rejected" ? (reasons[vars.id]?.trim() ?? null) : null,
          verified_at: vars.status === "verified" ? new Date().toISOString() : null,
          verified_by: vars.status === "verified" ? (session.user?.id ?? null) : null,
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    successMessage: "Document status updated",
    loadingMessage: "Updating document…",
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-checkin-documents", bookingId] });
    },
  });

  async function openDocument(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("guest-documents")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Could not open that document");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (query.isLoading) return <Skeleton className="h-32 w-full" />;
  const docs = query.data ?? [];
  if (!docs.length) {
    return <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <div key={doc.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {DOCUMENT_KIND_LABEL[doc.kind as CheckInDocumentKind] ?? doc.kind}
            </span>
            <span className="text-xs text-muted-foreground">
              {doc.file_name} · {formatBytes(doc.file_size)} ·{" "}
              {new Date(doc.created_at).toLocaleString()}
              {doc.document_expiry ? ` · expires ${doc.document_expiry}` : ""}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {badge(doc.status)}
              <Button size="sm" variant="ghost" onClick={() => void openDocument(doc.storage_path)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> View
              </Button>
            </div>
          </div>

          {doc.status === "rejected" && doc.rejection_reason && (
            <p className="mt-2 text-xs text-destructive">Reason: {doc.rejection_reason}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              className="h-8 max-w-xs"
              placeholder="Rejection reason (optional)"
              value={reasons[doc.id] ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, [doc.id]: e.target.value }))}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: doc.id, status: "pending" })}
            >
              Pending
            </Button>
            <Button
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: doc.id, status: "verified" })}
            >
              Verify
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: doc.id, status: "rejected" })}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
