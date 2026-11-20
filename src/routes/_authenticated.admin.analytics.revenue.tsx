import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { getRevenueAnalytics } from "@/domains/analytics/analytics.functions";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/analytics/revenue")({
  head: () => ({ meta: [{ title: "Revenue Analytics — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getRevenueAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.revenue"], queryFn: () => fn({ data: { days: 30 } }) });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Analytics" description="ADR, RevPAR, occupancy, and payment completion over 30 days." />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(data.revenue, data.currency)} />
        <StatCard label="Paid" value={formatMoney(data.paid, data.currency)} />
        <StatCard label="Outstanding" value={formatMoney(data.outstanding, data.currency)} />
        <StatCard label="Payment completion" value={`${Math.round(data.paymentCompletion * 100)}%`} />
        <StatCard label="ADR" value={formatMoney(data.adr, data.currency)} />
        <StatCard label="RevPAR" value={formatMoney(data.revpar, data.currency)} />
        <StatCard label="Occupancy" value={`${Math.round(data.occupancy * 100)}%`} />
      </div>
      {data.otherCurrencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Figures are in {data.currency}. Reservations in other currencies are not converted or included:{" "}
          {data.otherCurrencies.map((o) => formatMoney(o.amount, o.currency)).join(", ")}.
        </p>
      )}
      <SectionCard title="Revenue by day">
        <div className="space-y-1 text-sm">
          {data.byDay.slice(-30).map((r) => (
            <div key={r.day} className="flex items-center justify-between"><span>{r.day}</span><Badge variant="outline">{formatMoney(r.total, data.currency)}</Badge></div>
          ))}
          {!data.byDay.length && <p className="text-muted-foreground">No revenue data yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
