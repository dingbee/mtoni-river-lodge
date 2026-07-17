import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { getRevenueForecast } from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/forecast")({
  head: () => ({
    meta: [
      { title: "Revenue Forecast — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Forecast,
});

function Forecast() {
  const fn = useServerFn(getRevenueForecast);
  const { data, isLoading } = useQuery({ queryKey: ["finance.forecast"], queryFn: () => fn() });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue Forecast"
        description={`Projections based on confirmed reservations for the next ${data.horizonDays} days.`}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Expected occupancy" value={`${Math.round(data.expectedOccupancy * 100)}%`} />
        <StatCard label="Expected revenue" value={`$${Math.round(data.expectedRevenue).toLocaleString()}`} />
        <StatCard label="Pipeline" value={`$${Math.round(data.pipeline).toLocaleString()}`} />
        <StatCard
          label="Booking pace (30d Δ)"
          value={`${data.paceDelta >= 0 ? "+" : ""}${Math.round(data.paceDelta * 100)}%`}
          hint={`$${Math.round(data.past30Revenue).toLocaleString()} vs $${Math.round(data.prev30Revenue).toLocaleString()}`}
        />
      </div>
      <SectionCard title="Pipeline by month">
        <div className="space-y-2 text-sm">
          {data.byMonth.map((r) => (
            <div key={r.month} className="flex items-center justify-between">
              <span>{r.month}</span>
              <Badge variant="secondary">${Math.round(r.total).toLocaleString()}</Badge>
            </div>
          ))}
          {!data.byMonth.length && <p className="text-muted-foreground">No forward reservations yet.</p>}
        </div>
      </SectionCard>
      <p className="text-xs text-muted-foreground">
        Deterministic forecast — architecture supports adding an AI predictor via <code>defineAiInterface</code>.
      </p>
    </div>
  );
}