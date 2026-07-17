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

export const Route = createFileRoute("/_authenticated/admin/finance/analytics")({
  head: () => ({
    meta: [
      { title: "Revenue Analytics — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Analytics,
});

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
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useQuery({
    queryKey: ["finance.analytics", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue Analytics"
        description="Deep-dive reporting on revenue, guests and sources."
        actions={
          data ? (
            <Button size="sm" variant="outline" onClick={() => downloadCsv(`analytics-${from}-${to}.csv`, toCsv(data.byMonth as never))}>
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

      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Revenue" value={`$${Math.round(data.totalRevenue).toLocaleString()}`} />
            <StatCard label="Avg. spend / stay" value={`$${Math.round(data.avgSpendPerStay).toLocaleString()}`} />
            <StatCard label="Guests" value={data.guestCount} />
            <StatCard label="Avg. lifetime value" value={`$${Math.round(data.avgLifetimeValue).toLocaleString()}`} />
            <StatCard label="Cancellations" value={data.cancellationsCount} hint={`Impact $${Math.round(data.cancellationImpact).toLocaleString()}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Revenue by Month">
              <div className="space-y-2 text-sm">
                {data.byMonth.map((r) => (
                  <div key={r.month} className="flex justify-between">
                    <span>{r.month}</span>
                    <span className="font-medium">${Math.round(r.total).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Booking Source Performance">
              <div className="space-y-2 text-sm">
                {data.bySource.map((r) => (
                  <div key={r.source} className="flex justify-between">
                    <span className="capitalize">{r.source}</span>
                    <span>
                      <Badge variant="secondary" className="mr-2">{r.count}</Badge>
                      ${Math.round(r.total).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Top Guests by Spend">
              <div className="space-y-2 text-sm">
                {data.topGuests.map((g) => (
                  <div key={g.key} className="flex justify-between">
                    <span className="truncate pr-2">{g.key}</span>
                    <span>
                      <Badge variant="outline" className="mr-2">{g.stays} stays</Badge>
                      ${Math.round(g.total).toLocaleString()}
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