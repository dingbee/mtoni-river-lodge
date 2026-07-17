import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import {
  generateRoomReadinessInsights,
  listRoomReadinessInsights,
  updateRoomReadinessStatus,
} from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/readiness")({
  head: () => ({ meta: [{ title: "Room Readiness — Operations AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ReadinessPage,
});

function ReadinessPage() {
  const qc = useQueryClient();
  const list = useServerFn(listRoomReadinessInsights);
  const gen = useServerFn(generateRoomReadinessInsights);
  const update = useServerFn(updateRoomReadinessStatus);

  const q = useQuery({
    queryKey: ["ops-readiness", "pending"],
    queryFn: () => list({ data: { status: "pending" } }),
  });
  const genM = useMutation({
    mutationFn: () => gen({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-readiness"] });
      qc.invalidateQueries({ queryKey: ["ops-pressure"] });
    },
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; status: any }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-readiness"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Room Readiness Intelligence"
        description="Arrival risks, delayed readiness, turnaround pressure, and special preparation needs."
        actions={
          <Button size="sm" onClick={() => genM.mutate()} disabled={genM.isPending}>
            {genM.isPending ? "Analysing…" : "Run analysis"}
          </Button>
        }
      />
      <SectionCard title="Pending readiness insights">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((r: any) => (
              <li
                key={r.id}
                className={`rounded border p-3 ${
                  r.priority === "critical"
                    ? "border-red-500/50 bg-red-500/5"
                    : r.priority === "high"
                    ? "border-amber-500/50 bg-amber-500/5"
                    : ""
                }`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.rooms?.name ?? "—"} · {r.bookings?.reference ?? ""} · {r.bookings?.guest_name ?? ""}
                    </div>
                  </div>
                  <div className="text-xs uppercase text-muted-foreground">
                    {r.insight_type} · {r.priority}
                  </div>
                </div>
                <div className="mt-2 text-xs">{r.reasoning}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Confidence {Math.round(Number(r.confidence) * 100)}%
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: r.id, status: "approved" })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => upd.mutate({ id: r.id, status: "converted_to_task" })}
                  >
                    Convert to task
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: r.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No pending readiness insights. Run analysis to refresh.</p>
        )}
      </SectionCard>
    </div>
  );
}