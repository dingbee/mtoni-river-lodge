import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Info, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/os/LoadingState";
import { APP_VERSION, STAYNAS_PRODUCT, REQUIRED_SCHEMA_VERSION } from "@/modules/runtime/version";

export const Route = createFileRoute("/_authenticated/admin/system/nova")({
  head: () => ({ meta: [{ title: "System Information — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: StayNasSystemPage,
});

function useSystemInformation() {
  return useQuery({
    queryKey: ["staynas-system-information"],
    queryFn: async () => ({
      product: STAYNAS_PRODUCT,
      appVersion: APP_VERSION,
      schemaVersion: REQUIRED_SCHEMA_VERSION,
      runtime: "Hosted (cloud runtime)",
    }),
    staleTime: Infinity,
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function StayNasSystemPage() {
  const info = useSystemInformation();
  const data = info.data;
  return (
    <div className="space-y-6">
      <PageHeader title="System Information" description="StayNas product version, schema contract and runtime status."
        actions={<Button variant="outline" size="sm" className="min-h-11" onClick={() => info.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
      {info.isLoading ? <LoadingState label="Reading system information…" /> : (
        <>
          <SectionCard title="Product" description="Authoritative StayNas application identity and compatibility contract.">
            <div className="grid gap-3 md:grid-cols-2">
              <Row label="Product" value={data.product} />
              <Row label="Application version" value={data.appVersion} />
              <Row label="Required schema" value={data.schemaVersion} />
              <Row label="Runtime" value={data.runtime} />
            </div>
          </SectionCard>
          <SectionCard title="Runtime" description="Hosted StayNas service status.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-3 text-sm"><span className="flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" />Health</span><Badge variant="secondary">HOSTED</Badge></div>
              <div className="flex items-center justify-between rounded-md border p-3 text-sm"><span className="flex items-center gap-2"><Info className="h-4 w-4 text-muted-foreground" />Readiness</span><Badge variant="secondary">APPLICATION READY</Badge></div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
