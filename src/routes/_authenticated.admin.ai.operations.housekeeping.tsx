import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { getHousekeepingPriorities } from "@/domains/ai/operations/operations.functions";
import { generateRoomReadinessInsights } from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/housekeeping")({
  component: HousekeepingIntelligence,
});

function HousekeepingIntelligence() {
  const qc = useQueryClient();
  const fn = useServerFn(getHousekeepingPriorities);
  const q = useQuery({ queryKey: ["ops-hk-priorities"], queryFn: () => fn({ data: undefined as any }) });
  const gen = useServerFn(generateRoomReadinessInsights);
  const genM = useMutation({
    mutationFn: () => gen({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-hk-priorities"] });
      qc.invalidateQueries({ queryKey: ["ops-readiness"] });
      qc.invalidateQueries({ queryKey: ["ops-pressure"] });
    },
  });
  const priorities: any[] = genM.data?.priorities ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Housekeeping Intelligence"
        description="AI-suggested cleaning priority + Arrival Priority Engine. Housekeeping controls execution."
        actions={
          <Button size="sm" onClick={() => genM.mutate()} disabled={genM.isPending}>
            {genM.isPending ? "Analysing…" : "Run Arrival Priority Engine"}
          </Button>
        }
      />
      {!!priorities.length && (
        <SectionCard
          title="Arrival Priority Engine — today"
          description={`${genM.data?.inserted ?? 0} readiness insight(s) queued for review`}
        >
          <ul className="space-y-2 text-sm">
            {priorities.map((p, i) => (
              <li
                key={i}
                className={`rounded border p-3 ${
                  p.priority === "critical"
                    ? "border-red-500/50 bg-red-500/5"
                    : p.priority === "high"
                    ? "border-amber-500/50 bg-amber-500/5"
                    : ""
                }`}
              >
                <div className="flex justify-between gap-3">
                  <div className="font-medium">
                    {p.room} · {p.guest}
                  </div>
                  <span className="text-xs uppercase text-muted-foreground">{p.priority}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.reason}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Confidence {Math.round(p.confidence * 100)}%
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <SectionCard title="Priority order for today">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((p: any) => (
              <li key={p.booking_id} className="rounded border p-3">
                <div className="flex justify-between gap-3">
                  <div className="font-medium">{p.room_name}</div>
                  <span className="text-xs text-muted-foreground">Score {p.score}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.reasoning}</div>
                {p.next_arrival && (
                  <div className="mt-1 text-xs">
                    Next arrival: <b>{p.next_arrival.guest_name}</b>
                    {p.next_arrival.is_priority && " · priority"}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No turnovers today.</p>
        )}
      </SectionCard>
    </div>
  );
}