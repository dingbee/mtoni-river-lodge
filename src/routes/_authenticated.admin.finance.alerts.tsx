import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listFinancialAlerts,
  scanFinancialAlerts,
  resolveFinancialAlert,
} from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/alerts")({
  head: () => ({
    meta: [
      { title: "Financial Alerts — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Alerts,
});

function severityColor(s: string) {
  if (s === "critical" || s === "error") return "bg-red-100 text-red-700";
  if (s === "warn") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function Alerts() {
  const listFn = useServerFn(listFinancialAlerts);
  const scanFn = useServerFn(scanFinancialAlerts);
  const resolveFn = useServerFn(resolveFinancialAlert);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["finance.alerts"], queryFn: () => listFn() });

  const scan = useMutation({
    mutationFn: () => scanFn(),
    onSuccess: (r) => {
      toast.success(`Scan complete — ${r.created} new alert${r.created === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["finance.alerts"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id, status: "resolved" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance.alerts"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Alerts"
        description="Overdue balances, failed payments, and revenue anomalies."
        actions={
          <Button size="sm" variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className="mr-1 h-3 w-3" /> Run scan
          </Button>
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : (
        <SectionCard>
          <div className="space-y-2">
            {(data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No alerts. Run a scan to detect issues.</p>
            )}
            {(data ?? []).map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 rounded border border-border p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-medium">{a.title}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${severityColor(a.severity)}`}>{a.severity}</span>
                    <Badge variant="outline">{a.alert_type}</Badge>
                    <Badge variant="secondary">{a.status}</Badge>
                  </div>
                  {a.detail && <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>}
                </div>
                {a.status === "open" && (
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate(a.id)}>
                    Resolve
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}