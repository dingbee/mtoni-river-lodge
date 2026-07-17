import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkflowRuns, retryWorkflowRun } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/automation/monitor")({
  head: () => ({ meta: [{ title: "Automation Monitor — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MonitorPage,
});

const STATUSES = ["all","running","succeeded","failed","awaiting_approval","cancelled"];

function MonitorPage() {
  const [status, setStatus] = useState("all");
  const fn = useServerFn(listWorkflowRuns);
  const retry = useServerFn(retryWorkflowRun);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["awe-runs", status], queryFn: () => fn({ data: { status, limit: 100 } }) });
  const rows: any[] = (q.data as any) ?? [];
  const m = useMutation({
    mutationFn: (id: string) => retry({ data: { runId: id } }),
    onSuccess: () => { toast.success("Retry queued"); qc.invalidateQueries({ queryKey: ["awe-runs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Automation Monitor" description="Execution history, failures, and retries." />
      <div className="flex gap-1 text-xs">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded px-2 py-1 ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{r.workflow?.name ?? r.trigger_event}</div>
                <div className="text-xs text-muted-foreground">{r.trigger_event} · {new Date(r.started_at).toLocaleString()}{r.error && <> · <span className="text-rose-600">{r.error}</span></>}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${r.status === "failed" ? "text-rose-600" : r.status === "succeeded" ? "text-emerald-600" : "text-muted-foreground"}`}>{r.status}</span>
                {r.status === "failed" && <Button size="sm" variant="outline" onClick={() => m.mutate(r.id)}>Retry</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}