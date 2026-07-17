import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import {
  generateServiceRecoveryInsights,
  listServiceRecoveryInsights,
  updateServiceRecoveryStatus,
} from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/service-quality")({
  head: () => ({ meta: [{ title: "Service Recovery — Operations AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ServiceRecoveryPage,
});

function ServiceRecoveryPage() {
  const qc = useQueryClient();
  const list = useServerFn(listServiceRecoveryInsights);
  const gen = useServerFn(generateServiceRecoveryInsights);
  const upd = useServerFn(updateServiceRecoveryStatus);

  const q = useQuery({
    queryKey: ["ops-recovery", "pending"],
    queryFn: () => list({ data: { status: "pending" } }),
  });
  const genM = useMutation({
    mutationFn: () => gen({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-recovery"] });
      qc.invalidateQueries({ queryKey: ["ops-pressure"] });
    },
  });
  const updM = useMutation({
    mutationFn: (v: { id: string; status: any }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-recovery"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Recovery Intelligence"
        description="Signals from concierge escalations, guest feedback, reviews, alerts, and stay insights."
        actions={
          <Button size="sm" onClick={() => genM.mutate()} disabled={genM.isPending}>
            {genM.isPending ? "Scanning…" : "Scan last 14 days"}
          </Button>
        }
      />
      <SectionCard title="Pending recovery recommendations">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((r: any) => (
              <li key={r.id} className="rounded border p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.signal_source.replace(/_/g, " ")} · severity {r.severity}
                      {r.bookings?.reference ? ` · ${r.bookings.reference}` : ""}
                      {r.guests?.full_name ? ` · ${r.guests.full_name}` : ""}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {Math.round(Number(r.confidence) * 100)}%
                  </div>
                </div>
                <div className="mt-2 text-xs">Signal: {r.signal}</div>
                <div className="mt-1 text-xs">→ {r.recommendation}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updM.mutate({ id: r.id, status: "approved" })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updM.mutate({ id: r.id, status: "converted_to_task" })}
                  >
                    Assign to manager
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updM.mutate({ id: r.id, status: "resolved" })}>
                    Resolved
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updM.mutate({ id: r.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open recovery signals.</p>
        )}
      </SectionCard>
    </div>
  );
}