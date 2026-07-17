import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listStrategicRisks, detectStrategicRisks, updateRiskStatus } from "@/domains/ai/executive-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/executive/risks")({
  head: () => ({ meta: [{ title: "Strategic Risks — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

const sevColor: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listStrategicRisks);
  const detectFn = useServerFn(detectStrategicRisks);
  const updateFn = useServerFn(updateRiskStatus);
  const q = useQuery({ queryKey: ["ai.exec.risks"], queryFn: () => listFn() });
  const detect = useMutation({ mutationFn: () => detectFn(), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.exec.risks"] }) });
  const upd = useMutation({
    mutationFn: (v: { id: string; status: "open" | "acknowledged" | "mitigated" | "dismissed" }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.exec.risks"] }),
  });
  const risks = (q.data as any[]) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategic Risk Detection"
        description="Cross-domain risk signals — revenue decline, occupancy dips, satisfaction drops, cash-flow, campaign inactivity, operational bottlenecks."
        actions={<Button onClick={() => detect.mutate()} disabled={detect.isPending}>{detect.isPending ? "Scanning…" : "Run detection"}</Button>}
      />
      <SectionCard title={`Detected risks (${risks.length})`}>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          risks.length === 0 ? <p className="text-sm text-muted-foreground">No risks detected. Run detection to scan.</p> : (
          <div className="space-y-2">
            {risks.map((r) => (
              <div key={r.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={sevColor[r.severity] ?? ""} variant="outline">{r.severity}</Badge>
                  <Badge variant="outline">{r.risk_type}</Badge>
                  <Badge variant="secondary">{r.status}</Badge>
                  {(r.domains ?? []).map((d: string) => <Badge key={d} variant="outline">{d}</Badge>)}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(r.detected_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 font-medium">{r.title}</div>
                <div className="text-muted-foreground">{r.reasoning}</div>
                {r.status === "open" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: r.id, status: "acknowledged" })}>Acknowledge</Button>
                    <Button size="sm" onClick={() => upd.mutate({ id: r.id, status: "mitigated" })}>Mark mitigated</Button>
                    <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: r.id, status: "dismissed" })}>Dismiss</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}