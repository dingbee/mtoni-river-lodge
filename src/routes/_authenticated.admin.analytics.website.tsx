import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { getWebsiteAnalytics } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/website")({
  head: () => ({ meta: [{ title: "Website Analytics — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getWebsiteAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.website"], queryFn: () => fn({ data: undefined as any }) });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Website Analytics" description="Traffic, engagement, and conversion. Full data comes from GA4 (client-side)." />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Concierge sessions (30d)" value={data.conciergeSessions30d} />
        <StatCard label="Top landing pages" value={data.topLandingPages.length} />
        <StatCard label="Traffic sources" value={data.trafficSources.length} />
      </div>
      <SectionCard title="Note">
        <p className="text-sm text-muted-foreground">{data.note}</p>
      </SectionCard>
    </div>
  );
}
