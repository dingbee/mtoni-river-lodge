import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOpsAlerts, refreshOpsAlerts, resolveOpsAlert } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/operations/alerts")({
  head: () => ({ meta: [{ title: "Operations Alerts — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const fn = useServerFn(listOpsAlerts);
  const refresh = useServerFn(refreshOpsAlerts);
  const resolve = useServerFn(resolveOpsAlert);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ops-alerts"], queryFn: () => fn({ data: { includeResolved: false } }), staleTime: 30_000 });

  const refreshM = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r: any) => { toast.success(`${r.count} alert(s) refreshed`); qc.invalidateQueries({ queryKey: ["ops-alerts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolveM = useMutation({
    mutationFn: (id: string) => resolve({ data: { id } }),
    onSuccess: () => { toast.success("Resolved"); qc.invalidateQueries({ queryKey: ["ops-alerts"] }); },
  });
  const rows: any[] = (q.data as any) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Operations Alerts" description="Late arrivals, overdue departures, and payment issues." />
      <div>
        <Button size="sm" onClick={() => refreshM.mutate()} disabled={refreshM.isPending}>
          {refreshM.isPending ? "Refreshing…" : "Regenerate alerts"}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">All clear. No open alerts.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`mt-0.5 size-4 ${a.severity === "warn" ? "text-amber-600" : "text-rose-600"}`} />
                  <div>
                    <div className="text-sm font-medium">{a.kind.replace(/_/g, " ")}</div>
                    <div className="text-sm text-muted-foreground">{a.message}</div>
                    {a.booking && (
                      <Link to="/admin/operations/reservations/$id" params={{ id: a.booking.id }} className="text-xs text-primary hover:underline">
                        Open reservation {a.booking.reference}
                      </Link>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolveM.mutate(a.id)}>Resolve</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}