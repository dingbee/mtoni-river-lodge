import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getExecutiveDecisions, decideExecutiveItem } from "@/domains/ai/executive-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/executive/decisions")({
  head: () => ({ meta: [{ title: "Decision Queue — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const fn = useServerFn(getExecutiveDecisions);
  const act = useServerFn(decideExecutiveItem);
  const q = useQuery({ queryKey: ["ai.exec.decisions"], queryFn: () => fn() });
  const m = useMutation({
    mutationFn: (v: { id: string; module: string; action: "accept" | "dismiss" | "convert" | "assign" }) => act({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.exec.decisions"] }),
  });

  const d: any = q.data;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Decision Queue"
        description="Every pending AI recommendation across Guest, Revenue, and Marketing, ranked by impact × confidence."
      />
      {q.isLoading || !d ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
        <>
          <SectionCard title={`Pending decisions (${d.decisions.length})`}>
            {d.decisions.length === 0 ? <p className="text-sm text-muted-foreground">Nothing pending. Well done.</p> : (
              <div className="space-y-2">
                {(d.decisions as any[]).map((r) => (
                  <div key={`${r.module}:${r.id}`} className="rounded-xl border bg-card p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{r.origin}</Badge>
                      {r.kind && <Badge variant="outline">{r.kind}</Badge>}
                      {r.action && <Badge variant="outline">{r.action}</Badge>}
                      <Badge variant="outline">impact {Number(r.impact_score ?? 0)}</Badge>
                      <Badge variant="outline">conf {Math.round(Number(r.confidence ?? 0) * 100)}%</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 font-medium">{r.title}</div>
                    {r.reasoning && <div className="mt-1 text-muted-foreground">{r.reasoning}</div>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => m.mutate({ id: r.id, module: r.module, action: "accept" })}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => m.mutate({ id: r.id, module: r.module, action: "dismiss" })}>Dismiss</Button>
                      <Button size="sm" variant="outline" onClick={() => m.mutate({ id: r.id, module: r.module, action: "convert" })}>Convert to Task</Button>
                      <Link to={r.route as any}><Button size="sm" variant="ghost">Open source</Button></Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard title={`Workflow approvals (${d.approvals.length})`}>
            {d.approvals.length === 0 ? <p className="text-sm text-muted-foreground">No pending workflow approvals.</p> : (
              <ul className="space-y-1 text-sm">
                {(d.approvals as any[]).map((a) => (
                  <li key={a.id} className="rounded border p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.approval_kind ?? "approval"}</Badge>
                      <span className="font-medium">{a.subject ?? a.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <Link to="/admin/automation/approvals" className="text-xs text-primary underline">Open in Automation → Approvals</Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}