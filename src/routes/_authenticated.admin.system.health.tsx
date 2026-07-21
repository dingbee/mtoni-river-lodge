import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, BedDouble } from "lucide-react";
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
  getInventoryIntegrity,
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
  const fetchInventory = useServerFn(getInventoryIntegrity);

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

  const inventory = useQuery({
    queryKey: ["system-inventory-integrity"],
    queryFn: () => fetchInventory(),
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

  const inventoryOk = inventory.data ? inventory.data.status === "synced" : true;
  const productionReady = overall === "ok" && inventoryOk && (data.errors.unresolved ?? 0) === 0;

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

      <SectionCard
        title="Inventory Integrity"
        description="Cross-check between configured room inventory (rooms.total_units) and physical units on the Operations Room Board (room_states). Read-only — no changes are applied."
      >
        {inventory.isLoading ? (
          <LoadingState label="Checking inventory…" />
        ) : !inventory.data ? (
          <EmptyState title="Unavailable" description="Could not load inventory integrity data." />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {inventory.data.rows.map((r) => (
                <div key={r.room_id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <BedDouble className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{r.name}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Configured: <span className="font-medium text-foreground">{r.configured}</span>
                        {"  ·  "}
                        Physical Units: <span className="font-medium text-foreground">{r.physical}</span>
                      </div>
                    </div>
                    <Badge variant={r.status === "synced" ? "secondary" : "destructive"}>
                      {r.status === "synced" ? "Synced" : "Mismatch"}
                    </Badge>
                  </div>
                  {r.recommendation && (
                    <div className="mt-2 flex items-start gap-2 rounded-sm bg-destructive/5 p-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{r.recommendation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="text-muted-foreground">
                Totals — Configured{" "}
                <span className="font-medium text-foreground">{inventory.data.configured_total}</span> · Physical{" "}
                <span className="font-medium text-foreground">{inventory.data.physical_total}</span>
              </div>
              <Badge variant={inventory.data.status === "synced" ? "secondary" : "destructive"}>
                {inventory.data.status === "synced"
                  ? "All room types synced"
                  : `${inventory.data.mismatches} mismatch${inventory.data.mismatches === 1 ? "" : "es"} detected`}
              </Badge>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Production Readiness" description="Summary of the core operational subsystems.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            { label: "Room Inventory", ok: inventoryOk },
            { label: "Room States", ok: inventoryOk },
            { label: "Calendar Availability", ok: overall !== "down" },
            { label: "Reservation Engine", ok: (data.errors.unresolved ?? 0) === 0 },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="flex items-center gap-2">
                {item.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                {item.label}
              </span>
              <Badge variant={item.ok ? "secondary" : "destructive"}>{item.ok ? "OK" : "Attention"}</Badge>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border p-3">
          <span className="text-sm font-medium">Overall Status</span>
          <Badge variant={productionReady ? "secondary" : "destructive"}>
            {productionReady ? "Production Ready" : "Attention Required"}
          </Badge>
        </div>
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
                <Badge
                  variant={
                    j.last_status === "success"
                      ? "secondary"
                      : j.last_status === "failed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {j.enabled ? j.last_status ?? "pending" : "disabled"}
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