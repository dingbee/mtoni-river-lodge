import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { listOperationsAlerts, updateOperationsAlertStatus } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/alerts")({
  component: OperationsAlerts,
});

function OperationsAlerts() {
  const qc = useQueryClient();
  const list = useServerFn(listOperationsAlerts);
  const update = useServerFn(updateOperationsAlertStatus);
  const q = useQuery({ queryKey: ["ops-ai-alerts", "all"], queryFn: () => list({ data: { status: "all" } }) });
  const m = useMutation({
    mutationFn: (v: { id: string; status: "acknowledged" | "resolved" | "dismissed" }) =>
      update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-ai-alerts"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Operations Alerts" description="Every alert includes reasoning, evidence, and a recommended action." />
      <SectionCard title={`Alerts (${q.data?.length ?? 0})`}>
        {q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((a: any) => (
              <li key={a.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.reasoning}</div>
                    {a.recommended_action && <div className="mt-1 text-xs">→ {a.recommended_action}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border px-2 py-0.5 text-xs uppercase text-muted-foreground">
                      {a.status}
                    </span>
                    {a.status === "open" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => m.mutate({ id: a.id, status: "acknowledged" })}>
                          Acknowledge
                        </Button>
                        <Button size="sm" onClick={() => m.mutate({ id: a.id, status: "resolved" })}>
                          Resolve
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No alerts.</p>
        )}
      </SectionCard>
    </div>
  );
}