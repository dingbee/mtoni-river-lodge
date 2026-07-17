import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkflows, listWorkflowRuns, listApprovals } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";

export const Route = createFileRoute("/_authenticated/admin/automation/")({
  head: () => ({ meta: [{ title: "Automation Overview — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const wf = useServerFn(listWorkflows);
  const runs = useServerFn(listWorkflowRuns);
  const appr = useServerFn(listApprovals);
  const wfq = useQuery({ queryKey: ["awe-workflows"], queryFn: () => wf() });
  const runq = useQuery({ queryKey: ["awe-runs-recent"], queryFn: () => runs({ data: { limit: 5 } }) });
  const apq = useQuery({ queryKey: ["awe-approvals-pending"], queryFn: () => appr({ data: { status: "pending" } }) });
  const list: any[] = (wfq.data as any) ?? [];
  const active = list.filter((w) => w.enabled && !w.is_template).length;
  const templates = list.filter((w) => w.is_template).length;
  const recent: any[] = (runq.data as any) ?? [];
  const pending: any[] = (apq.data as any) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Automation Overview" description="Health of your workflow engine." />
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Active workflows" value={active} />
        <Stat label="Templates" value={templates} />
        <Stat label="Recent runs" value={recent.length} />
        <Stat label="Pending approvals" value={pending.length} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent runs</h3>
            <Link to="/admin/automation/monitor" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>{r.workflow?.name ?? r.trigger_event}</span>
                  <span className={`text-xs ${r.status === "failed" ? "text-rose-600" : "text-muted-foreground"}`}>{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pending approvals</h3>
            <Link to="/admin/automation/approvals" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing awaiting approval.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {pending.map((a) => (<li key={a.id}>{a.subject} <span className="text-xs text-muted-foreground">({a.approval_kind})</span></li>))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}