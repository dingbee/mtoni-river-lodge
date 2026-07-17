import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { getRevenueIntelligenceOverview } from "@/domains/ai/revenue-intelligence.functions";
import { DollarSign, TrendingUp, Percent, AlertTriangle, Activity, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue/")({
  head: () => ({ meta: [{ title: "Revenue Dashboard — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function money(v: number, c = "USD") { return `${c} ${Math.round(Number(v || 0)).toLocaleString()}`; }
function pct(v: number) { return `${Math.round(Number(v || 0) * 100)}%`; }

function Page() {
  const fn = useServerFn(getRevenueIntelligenceOverview);
  const q = useQuery({ queryKey: ["ai.revenue.overview"], queryFn: () => fn() });
  const d = q.data as any;
  return (
    <div className="space-y-4">
      <PageHeader title="Revenue Intelligence" description="Live occupancy, pricing, and revenue signals for management. All AI recommendations require human approval." />
      {q.isLoading || !d ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={DollarSign} label="Month-to-date revenue" value={money(d.mtdRevenue, d.currency)} />
            <StatCard icon={TrendingUp} label="Forward pipeline (30d)" value={money(d.forwardRevenue, d.currency)} />
            <StatCard icon={Percent} label="Occupancy (MTD)" value={pct(d.occupancy)} />
            <StatCard icon={Activity} label="RevPAR" value={money(d.revpar, d.currency)} hint={`ADR ${money(d.adr, d.currency)}`} />
            <StatCard icon={TrendingUp} label="Booking pace (30d Δ)" value={`${d.paceDelta >= 0 ? "+" : ""}${Math.round(d.paceDelta * 100)}%`} hint={`${money(d.past30Total, d.currency)} vs ${money(d.prev30Total, d.currency)}`} />
            <StatCard icon={Wallet} label="Outstanding balances" value={money(d.outstandingTotal, d.currency)} />
            <StatCard icon={AlertTriangle} label="Cancellations (30d)" value={String(d.cancellationCount)} />
            <StatCard icon={AlertTriangle} label="Open revenue alerts" value={String(d.openAlerts)} />
          </div>
          <SectionCard title="Notes">
            <p className="text-sm text-muted-foreground">
              Expected forward occupancy: {pct(d.expectedOccupancy)}. Revenue at risk (pending forward): {money(d.revenueAtRisk, d.currency)}.
              Use the tabs above to generate forecasts, review pricing recommendations, or scan for opportunities and alerts.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}