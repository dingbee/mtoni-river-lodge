import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue Dashboard"
        description="Live financial performance for Mtoni River Lodge."
        actions={
          <div className="flex gap-2">
            <Link to="/admin/finance/rate-plans" className="text-sm text-primary hover:underline">Rate Plans</Link>
            <Link to="/admin/finance/rate-overrides" className="text-sm text-primary hover:underline">Rate Overrides</Link>
            <Link to="/admin/finance/pricing-intelligence" className="text-sm text-primary hover:underline">Pricing Intelligence</Link>
            <Link to="/admin/finance/payments" className="text-sm text-primary hover:underline">
              Payments
            </Link>
            <Link to="/admin/finance/reports" className="text-sm text-primary hover:underline">
              Reports
            </Link>
          </div>
        }
      />

      {/* Health — score and monetary signals remain separated by currency. */}
      {health && (
        <SectionCard title="Revenue Health by Currency">
          <div className="space-y-3">
            {health.healthByCurrency.map((item) => (
              <div key={item.currency} className="flex flex-wrap items-center gap-4 border-b border-border/60 pb-3 last:border-0">
                <Badge variant={item.status === "healthy" ? "default" : item.status === "attention" ? "secondary" : "destructive"}>{item.currency}</Badge>
                <div>
                  <p className="text-sm font-medium capitalize">{item.status}</p>
                  <p className="text-xs text-muted-foreground">Score {item.score} / 100</p>
                </div>
                <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <div>Occupancy: <span className="font-medium">{pct(item.signals.occupancy30d)}</span></div>
                  <div>Outstanding: <span className="font-medium">{money(item.signals.outstanding, item.currency)}</span></div>
                  <div>Revenue 30d: <span className="font-medium">{money(item.signals.revenue30d, item.currency)}</span></div>
                  <div>Forward 30d: <span className="font-medium">{money(item.signals.forwardRevenue30d, item.currency)}</span></div>
                </div>
              </div>
            ))}
            {!health.healthByCurrency.length && <p className="text-sm text-muted-foreground">No revenue health data for the current period.</p>}
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
          <SectionCard title="Financial Position by Currency" >
            <div className="space-y-4">
              {data.currencyBreakdown.map((item) => {
                const refunds = data.refundsByCurrency.find((r) => r.currency === item.currency)?.amount ?? 0;
                const today = data.todayRevenueByCurrency.find((r) => r.currency === item.currency)?.amount ?? 0;
                const mtd = data.mtdRevenueByCurrency.find((r) => r.currency === item.currency)?.amount ?? 0;
                const ytd = data.ytdRevenueByCurrency.find((r) => r.currency === item.currency)?.amount ?? 0;
                return (
                  <div key={item.currency} className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="secondary">{item.currency}</Badge>
                      <span className="text-xs text-muted-foreground">{item.nightsSold} nights sold</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <StatCard label="Revenue" value={money(item.revenue, item.currency)} icon={DollarSign} />
                      <StatCard label="Paid" value={money(item.paid, item.currency)} icon={Wallet} />
                      <StatCard label="Outstanding" value={money(item.outstanding, item.currency)} icon={AlertCircle} />
                      <StatCard label="Deposits received" value={money(item.deposits, item.currency)} icon={Wallet} />
                      <StatCard label="Today" value={money(today, item.currency)} icon={DollarSign} />
                      <StatCard label="Month-to-date" value={money(mtd, item.currency)} icon={TrendingUp} />
                      <StatCard label="Year-to-date" value={money(ytd, item.currency)} icon={TrendingUp} />
                      <StatCard label="Refunds" value={money(refunds, item.currency)} icon={RefreshCw} />
                      <StatCard label="ADR" value={money(item.adr, item.currency)} icon={Percent} hint="Average daily rate" />
                      <StatCard label="RevPAR" value={money(item.revpar, item.currency)} icon={Activity} />
                    </div>
                  </div>
                );
              })}
              {!data.currencyBreakdown.length && <p className="text-sm text-muted-foreground">No bookings in this range.</p>}
            </div>
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
                    <span className="capitalize">{r.source}</span>
                    <span className="font-medium">{money(r.total, r.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Top Guest Nationalities">
              <div className="space-y-2">
                {data.revenueByCountry.map((r) => (
                  <div key={`${r.currency}-${r.country}`} className="flex items-center justify-between text-sm">
                    <span>{r.country}</span>
                    <span className="font-medium">{money(r.total, r.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Revenue Trend by Month">
              <div className="space-y-2">
                {data.revenueTrend.map((r) => (
                  <div key={`${r.currency}-${r.month}`} className="flex items-center justify-between text-sm">
                    <span>{r.month}</span>
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