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
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getRevenueDashboard, getRevenueHealth } from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/")({
  head: () => ({
    meta: [
      { title: "Revenue Dashboard — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RevenueDashboard,
});

function money(v: number, currency: string) {
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
              <div>Forward bookings: <span className="font-medium">{health.signals.forwardBookings30d}</span></div>
              <div className="col-span-2 sm:col-span-3">
                Collection exposure: {health.signals.byCurrency.length
                  ? health.signals.byCurrency.map((s) => `${s.currency} ${Math.round(s.outstandingRate * 100)}% outstanding`).join(" · ")
                  : "No booking data"}
              </div>
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
          <SectionCard title="Currency-separated financial position">
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span>Occupancy: <strong>{pct(data.occupancy)}</strong></span>
              <span>Nights sold: <strong>{data.nightsSold}</strong></span>
              <span>Room nights available: <strong>{data.availableRoomNights}</strong></span>
              {(data.balanceFieldMismatches > 0 || data.derivedBalanceMismatches > 0) && (
                <Badge variant="destructive">{data.balanceFieldMismatches} legacy/current balance mismatch(es)</Badge>
              )}
              {data.derivedBalanceMismatches > 0 && <Badge variant="destructive">{data.derivedBalanceMismatches} derived balance mismatch(es)</Badge>}
            </div>
            {data.currencySummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings in this range.</p>
            ) : data.currencySummaries.map((s) => (
              <div key={s.currency} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-sm font-semibold">{s.currency}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Today" value={money(s.todayRevenue, s.currency)} icon={DollarSign} />
                  <StatCard label="Month-to-date" value={money(s.mtdRevenue, s.currency)} icon={TrendingUp} />
                  <StatCard label="Year-to-date" value={money(s.ytdRevenue, s.currency)} icon={TrendingUp} />
                  <StatCard label="Revenue in range" value={money(s.revenue, s.currency)} icon={TrendingUp} />
                  <StatCard label="Outstanding" value={money(s.outstanding, s.currency)} icon={AlertCircle} />
                  <StatCard label="Deposits received" value={money(s.deposits, s.currency)} icon={Wallet} />
                  <StatCard label="Refunds" value={money(s.refunds, s.currency)} icon={RefreshCw} />
                  <StatCard label="ADR / RevPAR" value={`${money(s.adr, s.currency)} / ${money(s.revpar, s.currency)}`} icon={Activity} />
                </div>
              </div>
            ))}
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Revenue by Room">
              <div className="space-y-2">
                {data.revenueByRoom.length === 0 && (
                  <p className="text-sm text-muted-foreground">No revenue in this range.</p>
                )}
                {data.revenueByRoom.map((r) => (
                  <div key={`${r.currency}-${r.room_id}`} className="flex items-center justify-between text-sm">
                    <span>{r.name}</span>
                    <span className="font-medium">{money(r.total, r.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Revenue by Source">
              <div className="space-y-2">
                {data.revenueBySource.map((r) => (
                  <div key={`${r.currency}-${r.source}`} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{r.source} · {r.currency}</span>
                    <span className="font-medium">{money(r.total, r.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Top Guest Nationalities">
              <div className="space-y-2">
                {data.revenueByCountry.map((r) => (
                  <div key={`${r.currency}-${r.country}`} className="flex items-center justify-between text-sm">
                    <span>{r.country} · {r.currency}</span>
                    <span className="font-medium">{money(r.total, r.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Revenue Trend by Month">
              <div className="space-y-2">
                {data.revenueTrend.map((r) => (
                  <div key={`${r.currency}-${r.month}`} className="flex items-center justify-between text-sm">
                    <span>{r.month} · {r.currency}</span>
                    <Badge variant="secondary">{money(r.total, r.currency)}</Badge>
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