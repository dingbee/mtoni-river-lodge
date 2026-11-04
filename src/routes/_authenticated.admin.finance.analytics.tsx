import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { getRevenueAnalytics } from "@/domains/finance/finance.functions";
import { getRevenueIntelligence as getRevenueIntelligenceLedger } from "@/domains/finance/revenue-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/analytics")({
  head: () => ({
    meta: [
      { title: "Revenue Analytics — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Analytics,
});

function money(value: number, currency: string) {
  return `${currency} ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Analytics() {
  const fn = useServerFn(getRevenueAnalytics);
  const ledgerFn = useServerFn(getRevenueIntelligenceLedger);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance.analytics", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });

  const { data: ledgerData, isLoading: ledgerLoading, error: ledgerError } = useQuery({
    queryKey: ["finance.revenue-ledger", from, to],
    queryFn: () => ledgerFn({ data: { from, to } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue Analytics"
        description="Cash performance from the payment ledger, with booking value reported separately."
        actions={
          data ? (
            <Button size="sm" variant="outline" onClick={() => downloadCsv(`booked-value-analytics-${from}-${to}.csv`, toCsv(data.byMonth as never))}>
              <Download className="mr-1 h-3 w-3" /> Export CSV
            </Button>
          ) : null
        }
      />
      <SectionCard>
        <div className="flex flex-wrap gap-3">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </SectionCard>

      {error || ledgerError ? (
        <SectionCard title="Analytics unavailable"><p className="text-sm text-destructive">The analytics report could not be loaded. Refresh or contact a StayNas administrator.</p></SectionCard>
      ) : isLoading || !data || ledgerLoading || !ledgerData ? (
        <LoadingState />
      ) : false ? (
        <SectionCard title="Analytics unavailable"><p className="text-sm text-destructive">The analytics report could not be loaded. Refresh or contact a StayNas administrator.</p></SectionCard>
      ) : (
        <>
          <SectionCard title="Cash Performance" description="Cash movements from the payment transaction ledger. Booked value is separate; recognised revenue requires an approved accounting policy.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {ledgerData.byCurrency.map((item) => (
                <div key={item.currency} className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{item.currency}</div>
                  <div className="text-lg font-semibold">{money(item.cashCollected, item.currency)}</div>
                  <div className="text-xs text-muted-foreground">Cash collected</div>
                  <div className="text-sm">Refunds: {money(item.refunds, item.currency)}</div>
                  <div className="text-sm">Provider reversals: {money(item.providerReversals, item.currency)}</div>
                  <div className="text-sm font-medium">Net cash: {money(item.netCashReceived, item.currency)}</div>
                  <div className="text-xs text-muted-foreground">Booked value: {money(item.bookedValue, item.currency)}</div>
                </div>
              ))}
              {ledgerData.byCurrency.length === 0 && (
                <p className="text-sm text-muted-foreground">No booked value or cash movements recorded for this period.</p>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Cash period: UTC payment-event date · Booked-value period: reservation check-in date · Recognised revenue: not configured.</p>
          </SectionCard>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Cancellations" value={data.cancellationsCount} />
            {data.currencyBreakdown.map((item) => (
              <StatCard key={item.currency} label={`Booked value · ${item.currency}`} value={money(item.totalRevenue, item.currency)} hint={`Avg. spend/stay ${money(item.avgSpendPerStay, item.currency)} · LTV ${money(item.avgLifetimeValue, item.currency)} · cancellations ${money(item.cancellationImpact, item.currency)}`} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Booked Value by Month">
              <div className="space-y-2 text-sm">
                {data.byMonth.map((r) => (
                  <div key={`${r.currency}-${r.month}`} className="flex justify-between">
                    <span>{r.month}</span>
                    <span className="font-medium">{money(r.total, r.currency)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Booking Source — Booked Value">
              <div className="space-y-2 text-sm">
                {data.bySource.map((r) => (
                  <div key={`${r.currency}-${r.source}`} className="flex justify-between">
                    <span className="capitalize">{r.source}</span>
                    <span>
                      <Badge variant="secondary" className="mr-2">{r.count}</Badge>
                      {money(r.total, r.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Top Guests by Booked Value">
              <div className="space-y-2 text-sm">
                {data.topGuests.map((g) => (
                  <div key={`${g.currency}-${g.key}`} className="flex justify-between">
                    <span className="truncate pr-2">{g.key}</span>
                    <span>
                      <Badge variant="outline" className="mr-2">{g.stays} stays</Badge>
                      {money(g.total, g.currency)}
                    </span>
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