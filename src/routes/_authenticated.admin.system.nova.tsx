import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, HardDrive, Info, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/os/LoadingState";
import { APP_VERSION, NOVA_PRODUCT, REQUIRED_SCHEMA_VERSION } from "@/modules/runtime/version";
import type { SystemInformation } from "@/modules/runtime/local/diagnostics";

export const Route = createFileRoute("/_authenticated/admin/system/nova")({
  head: () => ({
    meta: [
      { title: "System Information — NOVA Hospitality" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NovaSystemPage,
});

/**
 * Product & runtime information (PRODUCTIZATION-4, Phases M and N).
 * Reads the local runtime's /nova/v1/system endpoint when the OS runs on an
 * appliance; on a hosted deployment it reports the bundle contract only.
 * It never renders a credential — the endpoint does not return any.
 */
function useSystemInformation() {
  return useQuery({
    queryKey: ["nova-system-information"],
    queryFn: async (): Promise<(SystemInformation & { product: string }) | null> => {
      try {
        const res = await fetch("/nova/v1/system", { headers: { accept: "application/json" } });
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) return null;
        return (await res.json()) as SystemInformation & { product: string };
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function NovaSystemPage() {
  const info = useSystemInformation();
  const data = info.data;
  const runtime = data ? "Local appliance" : "Hosted (cloud runtime)";

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Information"
        description="Product version, schema contract, runtime health and backup status."
        actions={
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => info.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      {info.isLoading ? (
        <LoadingState label="Reading runtime information…" />
      ) : (
        <>
          <SectionCard title="Product" description="Single authoritative version, shared by installer, diagnostics and support.">
            <div className="grid gap-3 md:grid-cols-2">
              <Row label="Product" value={data?.product ?? NOVA_PRODUCT} />
              <Row label="Application version" value={data?.appVersion ?? APP_VERSION} />
              <Row label="Required schema" value={REQUIRED_SCHEMA_VERSION} />
              <Row label="Installed schema" value={data?.schemaVersion ?? "—"} />
              <Row label="Runtime" value={runtime} />
              <Row label="Installation id" value={data?.installId ?? "—"} />
            </div>
          </SectionCard>

          <SectionCard title="Runtime" description="Live state of the local services.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" /> Health
                </span>
                <Badge variant={data?.health === "ok" ? "secondary" : data ? "destructive" : "outline"}>
                  {data?.health?.toUpperCase() ?? "NOT APPLICABLE"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" /> Readiness
                </span>
                <Badge variant={data?.ready ? "secondary" : data ? "destructive" : "outline"}>
                  {data ? (data.ready ? "SYSTEM READY" : "NOT READY") : "NOT APPLICABLE"}
                </Badge>
              </div>
              <Row label="Database" value={data?.postgresVersion ? `PostgreSQL ${data.postgresVersion}` : "—"} />
              <Row label="Migrations applied" value={data?.migrationsApplied?.toString() ?? "—"} />
            </div>
          </SectionCard>

          <SectionCard
            title="Backup & recovery"
            description="Backups are taken and restored by the on-site administrator using the appliance tools. Restore is never available from this screen."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" /> Last backup
                </span>
                <span className="font-medium">
                  {data?.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : "None recorded"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span>Integrity</span>
                <Badge variant={data?.lastBackupStatus === "verified" ? "secondary" : "outline"}>
                  {(data?.lastBackupStatus ?? "none").toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Backup, restore and diagnostics run on the appliance itself
                (<code>local/scripts/backup.sh</code>, <code>restore.sh</code>, <code>diagnostics.sh</code>). Restore requires
                shell access on the server, so ordinary terminal staff cannot destroy or replace the database.
              </span>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
