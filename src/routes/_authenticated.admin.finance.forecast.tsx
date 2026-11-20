import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { getRevenueForecast } from "@/domains/finance/finance.functions";
import { formatMoney } from "@/lib/money";

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
        <StatCard label="Expected revenue" value={formatMoney(data.expectedRevenue, data.currency)} />
        <StatCard label="Pipeline" value={formatMoney(data.pipeline, data.currency)} />
        <StatCard
          label="Booking pace (30d Δ)"
          value={`${data.paceDelta >= 0 ? "+" : ""}${Math.round(data.paceDelta * 100)}%`}
          hint={`${formatMoney(data.past30Revenue, data.currency)} vs ${formatMoney(data.prev30Revenue, data.currency)}`}
        />
      </div>
      <SectionCard title="Pipeline by month">
        <div className="space-y-2 text-sm">
          {data.byMonth.map((r) => (
            <div key={r.month} className="flex items-center justify-between">
              <span>{r.month}</span>
              <Badge variant="secondary">{formatMoney(r.total, data.currency)}</Badge>
            </div>
          ))}
          {!data.byMonth.length && <p className="text-muted-foreground">No forward reservations yet.</p>}
        </div>
      </SectionCard>
      {data.otherCurrencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Forecast in {data.currency}. Forward reservations in other currencies are excluded and not converted:{" "}
          {data.otherCurrencies.map((o) => formatMoney(o.amount, o.currency)).join(", ")}.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Deterministic forecast — architecture supports adding an AI predictor via <code>defineAiInterface</code>.
      </p>
    </div>
  );
}