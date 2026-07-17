import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import {
  generateStaffOperationsInsights,
  listStaffOperationsInsights,
  updateStaffInsightStatus,
} from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/staff")({
  head: () => ({ meta: [{ title: "Staff Operations Insights — Operations AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: StaffInsightsPage,
});

function StaffInsightsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStaffOperationsInsights);
  const gen = useServerFn(generateStaffOperationsInsights);
  const upd = useServerFn(updateStaffInsightStatus);

  const q = useQuery({
    queryKey: ["ops-staff", "pending"],
    queryFn: () => list({ data: { status: "pending" } }),
  });
  const genM = useMutation({
    mutationFn: () => gen({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-staff"] });
      qc.invalidateQueries({ queryKey: ["ops-pressure"] });
    },
  });
  const updM = useMutation({
    mutationFn: (v: { id: string; status: any }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-staff"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Operations Intelligence"
        description="Process, training, and workload signals — never individual surveillance."
        actions={
          <Button size="sm" onClick={() => genM.mutate()} disabled={genM.isPending}>
            {genM.isPending ? "Analysing…" : "Analyse last 30 days"}
          </Button>
        }
      />
      <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        This module analyses aggregate task metrics only. It does not rank employees or expose per-person performance.
      </div>
      <SectionCard title="Pending operational recommendations">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((r: any) => (
              <li key={r.id} className="rounded border p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs uppercase text-muted-foreground">{r.insight_type.replace(/_/g, " ")}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{r.reasoning}</div>
                <div className="mt-1 text-xs">→ {r.recommendation}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {r.affected_area ? `${r.affected_area} · ` : ""}Confidence {Math.round(Number(r.confidence) * 100)}%
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updM.mutate({ id: r.id, status: "approved" })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updM.mutate({ id: r.id, status: "actioned" })}>
                    Actioned
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updM.mutate({ id: r.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No pending insights. Run analysis to refresh.</p>
        )}
      </SectionCard>
    </div>
  );
}