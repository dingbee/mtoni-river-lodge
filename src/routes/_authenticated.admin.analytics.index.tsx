import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { getAnalyticsHub } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/")({
  head: () => ({ meta: [{ title: "Analytics Hub — Mtoni OS" }] }),
  component: Hub,
});

function pctFmt(n: number) { return `${Math.round(n * 100)}%`; }

function Hub() {
  const fn = useServerFn(getAnalyticsHub);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.hub"], queryFn: () => fn({ data: undefined as any }) });
  if (isLoading || !data) return <LoadingState />;
  const t = data.today;
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics & Intelligence Hub" description="Unified health & performance across the lodge, website, and AI." />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Occupancy (30d)" value={pctFmt(t.occupancy)} />
        <StatCard label="ADR" value={`$${Math.round(t.adr).toLocaleString()}`} />
        <StatCard label="RevPAR" value={`$${Math.round(t.revpar).toLocaleString()}`} />
        <StatCard label="Revenue (30d)" value={`$${Math.round(t.revenue).toLocaleString()}`} />
        <StatCard label="Bookings (30d)" value={t.bookings30d} />
        <StatCard label="Cancellation rate" value={pctFmt(t.cancelRate)} />
        <StatCard label="Guest rating" value={t.avgRating ? t.avgRating.toFixed(2) : "—"} />
        <StatCard label="AI interactions (30d)" value={t.aiInteractions30d} />
        <StatCard label="Open ops alerts" value={t.openAlerts} />
        <StatCard label="Active campaigns" value={t.activeCampaigns} />
        <StatCard label="Arrivals today" value={t.arrivalsCount} />
      </div>
    </div>
  );
}
