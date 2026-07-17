import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getSystemHealth,
  listSystemErrors,
  resolveSystemError,
} from "@/lib/observability/observability.functions";

export const Route = createFileRoute("/_authenticated/admin/system/health")({
  head: () => ({
    meta: [
      { title: "System Health — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SystemHealthPage,
});

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ok") return "secondary";
  if (status === "degraded") return "outline";
  return "destructive";
}

function SystemHealthPage() {
  const qc = useQueryClient();
  const fetchHealth = useServerFn(getSystemHealth);
  const fetchErrors = useServerFn(listSystemErrors);
  const resolve = useServerFn(resolveSystemError);

  const health = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
  });

  const errors = useQuery({
    queryKey: ["system-errors", "unresolved"],
    queryFn: () => fetchErrors({ data: { resolved: false, limit: 50 } }),
    refetchInterval: 60_000,
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolve({ data: { id } }),
    onSuccess: () => {
      toast.success("Error marked resolved");
      qc.invalidateQueries({ queryKey: ["system-errors"] });
      qc.invalidateQueries({ queryKey: ["system-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (health.isLoading) return <LoadingState label="Loading system health…" />;
  const data = health.data;
  if (!data) return <EmptyState title="No data" description="Health endpoint has not been probed yet." />;

  const overall =
    data.probes.some((p) => p.status === "down")
      ? "down"
      : data.probes.some((p) => p.status === "degraded")
        ? "degraded"
        : "ok";

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Live probes, error rate, and scheduled job status."
        actions={
          <Button variant="outline" size="sm" onClick={() => health.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="Overall"
          value={overall.toUpperCase()}
          icon={overall === "ok" ? CheckCircle2 : AlertTriangle}
        />
        <StatCard label="Errors (1h)" value={String(data.errors.last_1h)} icon={AlertTriangle} />
        <StatCard label="Errors (24h)" value={String(data.errors.last_24h)} icon={Activity} />
        <StatCard label="Unresolved" value={String(data.errors.unresolved)} icon={AlertTriangle} />
      </div>

      <SectionCard title="Probes" description="Latest result per subsystem (refreshed by /api/public/health hits).">
        {data.probes.length === 0 ? (
          <EmptyState title="No probes yet" description="Call /api/public/health to record the first probe." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.probes.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.latency_ms != null ? `${p.latency_ms} ms · ` : ""}
                    {formatDistanceToNow(new Date(p.checked_at), { addSuffix: true })}
                  </div>
                </div>
                <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Scheduled jobs" description="Most recent scheduled_jobs runs.">
        {data.scheduled_jobs.length === 0 ? (
          <EmptyState title="No jobs" description="No scheduled jobs have been recorded." />
        ) : (
          <div className="space-y-2">
            {data.scheduled_jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{j.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.last_run_at
                      ? `Last: ${formatDistanceToNow(new Date(j.last_run_at), { addSuffix: true })}`
                      : "Not yet run"}
                    {j.next_run_at
                      ? ` · Next: ${formatDistanceToNow(new Date(j.next_run_at), { addSuffix: true })}`
                      : ""}
                  </div>
                  {j.last_error && (
                    <div className="mt-1 text-xs text-destructive line-clamp-2">{j.last_error}</div>
                  )}
                </div>
                <Badge variant={j.status === "success" ? "secondary" : j.status === "failed" ? "destructive" : "outline"}>
                  {j.status ?? "unknown"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Unresolved errors" description="Server-side exceptions captured via withCapture / captureError.">
        {errors.isLoading ? (
          <LoadingState label="Loading errors…" />
        ) : (errors.data ?? []).length === 0 ? (
          <EmptyState title="Clean" description="No unresolved errors." />
        ) : (
          <div className="space-y-2">
            {(errors.data ?? []).map((e) => (
              <div key={e.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={e.severity === "fatal" || e.severity === "error" ? "destructive" : "outline"}>
                        {e.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {e.module}
                        {e.function_name ? `.${e.function_name}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-medium">{e.message}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolveMut.mutate(e.id)}
                    disabled={resolveMut.isPending}
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {data.email_dlq_count > 0 && (
        <SectionCard title="Email delivery" description="Dead-lettered emails need attention.">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>{data.email_dlq_count} email(s) in DLQ — retry from the automation console.</span>
          </div>
        </SectionCard>
      )}
    </div>
  );
}