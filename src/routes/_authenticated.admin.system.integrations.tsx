import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listFounderIntegrationHealth } from "@/lib/founder-integration-monitoring.functions";

export const Route = createFileRoute("/_authenticated/admin/system/integrations")({
  head: () => ({ meta: [{ title: "Integration Monitoring — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: FounderIntegrationMonitoringPage,
});

function FounderIntegrationMonitoringPage() {
  const fetchHealth = useServerFn(listFounderIntegrationHealth);
  const health = useQuery({ queryKey: ["founder-integration-health"], queryFn: () => fetchHealth(), refetchInterval: 60000 });
  return <div className="space-y-6">
    <PageHeader title="Integration Monitoring" description="Founder Admin read-only view of cross-property integration health. Credential values and tenant configuration controls are intentionally excluded." actions={<Button variant="outline" size="sm" onClick={() => health.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
    <SectionCard title="Provider health" description="This screen reports configuration and verification metadata only. It cannot edit tenant settings or retrieve credentials.">
      {health.isLoading ? <LoadingState label="Loading integration health…" /> : health.isError ? <EmptyState title="Access denied or unavailable" description="This view requires the explicit global Founder Admin role. Property owner/manager roles do not grant cross-property monitoring." /> : (health.data ?? []).length === 0 ? <EmptyState title="No payment integrations" description="No payment integration metadata was found." /> : <div className="space-y-3">
        {(health.data ?? []).map((row: any) => <div key={row.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="font-medium">{row.displayName}</div><div className="mt-1 text-xs text-muted-foreground">Property ID: {row.propertyId} · {row.environment} · {row.enabled ? "Enabled" : "Disabled"}</div><div className="mt-1 text-xs text-muted-foreground">Updated: {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "Unknown"}{row.lastVerifiedAt ? ` · Verified: ${new Date(row.lastVerifiedAt).toLocaleString()}` : ""}</div></div>
            <Badge variant={row.verificationStatus === "verified" && row.enabled ? "secondary" : "outline"}>{row.verificationStatus}</Badge>
          </div>
          {row.hasRecordedVerificationError && <div className="mt-3 flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />A verification failure is recorded. Details are withheld from this summary.</div>}
        </div>)}
      </div>}
    </SectionCard>
    <SectionCard title="Access boundary"><div className="flex items-start gap-3 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>Read-only monitoring. Credential references, secret values, and raw provider errors are not exposed. Tenant integration setup remains the responsibility of each property's authorized owner or manager.</p></div></SectionCard>
  </div>;
}
