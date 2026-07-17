import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { getExecutiveOverview } from "@/domains/ai/executive-intelligence.functions";
import { Bed, TrendingUp, Users, DollarSign, Sparkles, AlertTriangle, ListChecks, Star, ClipboardCheck, LayoutDashboard, Activity, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/executive/")({
  head: () => ({ meta: [{ title: "Executive Dashboard — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

const pct = (v: number) => `${Math.round(Number(v || 0) * 100)}%`;
const money = (v: number, c = "USD") => `${c} ${Math.round(Number(v || 0)).toLocaleString()}`;

function Page() {
  const fn = useServerFn(getExecutiveOverview);
  const q = useQuery({ queryKey: ["ai.exec.overview"], queryFn: () => fn() });
  const d = q.data as any;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Intelligence"
        description="One command centre for lodge leadership. Every recommendation is evidence-based and requires human approval before any operational change."
      />
      {q.isLoading || !d ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Bed} label="Occupancy today" value={pct(d.occupancyToday)} hint={`${d.occupiedTonight}/${d.totalUnits} rooms in-house`} />
            <StatCard icon={DollarSign} label="MTD revenue" value={money(d.mtdRevenue, d.currency)} hint={`Forward 30d: ${money(d.forwardRevenue, d.currency)}`} />
            <StatCard icon={Users} label="Arrivals today" value={String(d.arrivalsToday)} hint={`${d.vipToday} VIP/climber`} />
            <StatCard icon={ClipboardCheck} label="Departures today" value={String(d.departuresToday)} />
            <StatCard icon={ShieldCheck} label="Outstanding balances" value={money(d.outstandingTotal, d.currency)} />
            <StatCard icon={Sparkles} label="Pending approvals" value={String(d.pendingApprovals)} />
            <StatCard icon={AlertTriangle} label="Active alerts" value={String(d.activeAlerts)} />
            <StatCard icon={ListChecks} label="Pending AI recs" value={String(d.pendingRecommendations)} hint="Across Guest, Revenue & Marketing AI" />
            <StatCard icon={TrendingUp} label="Revenue health" value={pct(d.revenueHealth)} />
            <StatCard icon={Activity} label="Marketing health" value={pct(d.marketingHealth)} />
            <StatCard icon={Star} label="Guest satisfaction" value={pct(d.guestSatisfactionHealth)} hint={`${(d.avgRating ?? 0).toFixed(2)}★ last 180d`} />
            <StatCard icon={LayoutDashboard} label="AI priority score" value={String(d.aiPriorityScore)} hint="0-100" />
          </div>
          <SectionCard title="What each widget means">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li><strong>Occupancy today</strong> — in-house bookings / active room units.</li>
              <li><strong>Revenue health</strong> — weighted current occupancy + forward pipeline + collections.</li>
              <li><strong>Marketing health</strong> — combined review sentiment and pending recommendation load.</li>
              <li><strong>Guest satisfaction</strong> — average approved review rating over the last 180 days.</li>
              <li><strong>AI priority score</strong> — weighted total of open risks, alerts, and pending recommendations.</li>
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}