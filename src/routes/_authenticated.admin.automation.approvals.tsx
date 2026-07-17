import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listApprovals, decideApproval } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/automation/approvals")({
  head: () => ({ meta: [{ title: "Approvals — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [status, setStatus] = useState("pending");
  const fn = useServerFn(listApprovals);
  const d = useServerFn(decideApproval);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["awe-approvals", status], queryFn: () => fn({ data: { status } }) });
  const rows: any[] = (q.data as any) ?? [];
  const m = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) => d({ data: v }),
    onSuccess: () => { toast.success("Decision recorded"); qc.invalidateQueries({ queryKey: ["awe-approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Approval Workflows" description="High-value refunds, discounts, rate changes, and publishing." />
      <div className="flex gap-1 text-xs">
        {["pending","approved","rejected","all"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded px-2 py-1 ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to show.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{a.subject}</div>
                <div className="text-xs text-muted-foreground">{a.approval_kind} · {new Date(a.created_at).toLocaleString()}</div>
              </div>
              {a.status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => m.mutate({ id: a.id, decision: "approved" })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => m.mutate({ id: a.id, decision: "rejected" })}>Reject</Button>
                </div>
              ) : <span className="text-xs text-muted-foreground">{a.status}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}