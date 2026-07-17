import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Wallet,
  RefreshCw,
  Percent,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getRevenueDashboard, getRevenueHealth } from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance")({
  head: () => ({
    meta: [
      { title: "Revenue Dashboard — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RevenueDashboard,
});

function money(v: number, currency = "USD") {
  return `${currency} ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function RevenueDashboard() {
  const dashFn = useServerFn(getRevenueDashboard);
  const healthFn = useServerFn(getRevenueHealth);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["finance.dashboard", from, to],
    queryFn: () => dashFn({ data: { from, to } }),
  });
  const { data: health } = useQuery({
    queryKey: ["finance.health"],
    queryFn: () => healthFn(),
  });

  const healthColor = useMemo(() => {
    if (!health) return "bg-muted";
    if (health.status === "healthy") return "bg-emerald-500";
    if (health.status === "attention") return "bg-amber-500";
    return "bg-red-500";
  }, [health]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue Dashboard"
        description="Live financial performance for Mtoni River Lodge."
        actions={
          <div className="flex gap-2">
            <Link to="/admin/finance/payments" className="text-sm text-primary hover:underline">
              Payments
            </Link>
            <Link to="/admin/finance/reports" className="text-sm text-primary hover:underline">
              Reports
            </Link>
          </div>
        }
      />

      {/* Health */}
      {health && (
        <SectionCard>
          <div className="flex flex-wrap items-center gap-4">
            <div className={`h-4 w-4 rounded-full ${healthColor}`} />
            <div>
              <p className="text-sm font-medium capitalize">Revenue health: {health.status}</p>
              <p className="text-xs text-muted-foreground">Score {health.score} / 100</p>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              <div>Occupancy 30d: <span className="font-medium">{pct(health.signals.occupancy30d)}</span></div>
              <div>Outstanding: <span className="font-medium">{money(health.signals.outstanding)}</span></div>
              <div>Rev 30d: <span className="font-medium">{money(health.signals.revenue30d)}</span></div>
              <div>Forward 30d: <span className="font-medium">{money(health.signals.forwardRevenue30d)}</span></div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Filters */}
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </SectionCard>

      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Today" value={money(data.todayRevenue, data.currency)} icon={DollarSign} />
            <StatCard label="Month-to-date" value={money(data.mtdRevenue, data.currency)} icon={TrendingUp} />
            <StatCard label="Year-to-date" value={money(data.ytdRevenue, data.currency)} icon={TrendingUp} />
            <StatCard label="Outstanding" value={money(data.outstanding, data.currency)} icon={AlertCircle} />
            <StatCard label="Deposits received" value={money(data.deposits, data.currency)} icon={Wallet} />
            <StatCard label="Refunds" value={money(data.refunds, data.currency)} icon={RefreshCw} />
            <StatCard label="ADR" value={money(data.adr, data.currency)} icon={Percent} hint="Average daily rate" />
            <StatCard label="RevPAR" value={money(data.revpar, data.currency)} icon={Activity} hint={`Occupancy ${pct(data.occupancy)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Revenue by Room">
              <div className="space-y-2">
                {data.revenueByRoom.length === 0 && (
                  <p className="text-sm text-muted-foreground">No revenue in this range.</p>
                )}
                {data.revenueByRoom.map((r) => (
                  <div key={r.room_id} className="flex items-center justify-between text-sm">
                    <span>{r.name}</span>
                    <span className="font-medium">{money(r.total, data.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Revenue by Source">
              <div className="space-y-2">
                {data.revenueBySource.map((r) => (
                  <div key={r.source} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{r.source}</span>
                    <span className="font-medium">{money(r.total, data.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Top Guest Nationalities">
              <div className="space-y-2">
                {data.revenueByCountry.map((r) => (
                  <div key={r.country} className="flex items-center justify-between text-sm">
                    <span>{r.country}</span>
                    <span className="font-medium">{money(r.total, data.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Revenue Trend by Month">
              <div className="space-y-2">
                {data.revenueTrend.map((r) => (
                  <div key={r.month} className="flex items-center justify-between text-sm">
                    <span>{r.month}</span>
                    <Badge variant="secondary">{money(r.total, data.currency)}</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}