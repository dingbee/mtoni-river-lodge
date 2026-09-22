import { createFileRoute } from "@tanstack/react-router";
import { Database, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_VERSION, STAYNAS_PRODUCT, REQUIRED_SCHEMA_VERSION } from "@/modules/runtime/version";

export const Route = createFileRoute("/_authenticated/admin/system/nova")({
  head: () => ({
    meta: [
      { title: "System Information — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StayNasSystemPage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StayNasSystemPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Information"
        description="StayNas product identity, application version and database schema contract."
        actions={<Button variant="outline" size="sm" className="min-h-11" onClick={() => window.location.reload()}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>}
      />

      <SectionCard title="Product" description="Authoritative StayNas application identity.">
        <div className="grid gap-3 md:grid-cols-2">
          <Row label="Product" value={STAYNAS_PRODUCT} />
          <Row label="Application version" value={APP_VERSION} />
          <Row label="Required schema" value={REQUIRED_SCHEMA_VERSION} />
          <Row label="Runtime" value="Hosted cloud runtime" />
        </div>
      </SectionCard>

      <SectionCard title="Backend" description="StayNas uses its configured Supabase backend for authentication, data and realtime services.">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" /> Database</span>
            <Badge variant="secondary">CONFIGURED</Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Authentication</span>
            <Badge variant="secondary">SUPABASE</Badge>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Migration status" description="Database migration and production certification are tracked separately from application identity.">
        <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Production database migration is not inferred from the UI. It must be verified against the target StayNas Supabase project before release certification.</span>
        </div>
      </SectionCard>
    </div>
  );
}
