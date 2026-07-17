import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import {
  generateOperationsPatterns,
  listOperationsPatterns,
  updatePatternStatus,
} from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/patterns")({
  head: () => ({ meta: [{ title: "Operational Patterns — Operations AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PatternsPage,
});

function PatternsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listOperationsPatterns);
  const gen = useServerFn(generateOperationsPatterns);
  const upd = useServerFn(updatePatternStatus);

  const q = useQuery({
    queryKey: ["ops-patterns", "pending"],
    queryFn: () => list({ data: { status: "pending" } }),
  });
  const genM = useMutation({
    mutationFn: () => gen({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-patterns"] });
      qc.invalidateQueries({ queryKey: ["ops-pressure"] });
    },
  });
  const updM = useMutation({
    mutationFn: (v: { id: string; status: any }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-patterns"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operational Pattern Detection"
        description="Frequent guest requests, seasonal pressure, and repeated complaints across the last 30 days."
        actions={
          <Button size="sm" onClick={() => genM.mutate()} disabled={genM.isPending}>
            {genM.isPending ? "Detecting…" : "Detect patterns"}
          </Button>
        }
      />
      <SectionCard title="Pending patterns">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((p: any) => (
              <li key={p.id} className="rounded border p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs uppercase text-muted-foreground">{p.pattern_type.replace(/_/g, " ")}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.description}</div>
                {p.recommendation && <div className="mt-1 text-xs">→ {p.recommendation}</div>}
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {p.timeframe_days}d window · confidence {Math.round(Number(p.confidence) * 100)}%
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updM.mutate({ id: p.id, status: "approved" })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updM.mutate({ id: p.id, status: "actioned" })}>
                    Actioned
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updM.mutate({ id: p.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No patterns detected yet.</p>
        )}
      </SectionCard>
    </div>
  );
}