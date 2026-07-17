import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import { getBookingPatterns } from "@/domains/ai/revenue-intelligence.functions";
import { Clock, Moon, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue/patterns")({
  head: () => ({ meta: [{ title: "Booking Patterns — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getBookingPatterns);
  const q = useQuery({ queryKey: ["ai.revenue.patterns"], queryFn: () => fn() });
  const d = q.data as any;
  return (
    <div className="space-y-4">
      <PageHeader title="Booking Pattern Intelligence" description="Lead times, stay lengths, sources, seasonality, and cancellations over the last 365 days." />
      {q.isLoading || !d ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Clock} label="Avg. lead time" value={`${d.avgLeadDays} days`} />
            <StatCard icon={Moon}  label="Avg. stay"      value={`${d.avgStayNights} nights`} />
            <StatCard icon={XCircle} label="Cancellation rate" value={`${Math.round(d.cancellationRate * 100)}%`} />
            <StatCard label="Sample" value={String(d.sampleSize)} hint="Bookings analysed" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Booking sources">
              <ul className="space-y-1 text-sm">
                {d.bySource.map((s: any) => (
                  <li key={s.source} className="flex justify-between"><span className="capitalize">{s.source}</span><span><Badge variant="secondary" className="mr-2">{s.count}</Badge>${Math.round(s.revenue).toLocaleString()}</span></li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Peak & low seasons">
              <p className="text-sm">Peak month: <b>{d.peakMonth ?? "—"}</b></p>
              <p className="text-sm">Low month: <b>{d.lowMonth ?? "—"}</b></p>
              <div className="mt-2 space-y-1 text-xs">
                {d.byMonth.slice(-12).map((m: any) => (
                  <div key={m.month} className="flex justify-between"><span>{m.month}</span><span>${Math.round(m.total).toLocaleString()}</span></div>
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}