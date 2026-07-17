import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { getBookingAnalytics } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/bookings")({
  head: () => ({ meta: [{ title: "Booking Analytics — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getBookingAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.bookings"], queryFn: () => fn({ data: { days: 30 } }) });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Booking Analytics" description="Booking mix, funnel, and pace across the last 30 days." />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Bookings" value={data.total} />
        <StatCard label="Cancellation rate" value={`${Math.round(data.cancelRate * 100)}%`} />
        <StatCard label="Avg lead time" value={`${Math.round(data.avgLeadDays)}d`} />
        <StatCard label="Avg stay" value={`${data.avgStayNights.toFixed(1)} nights`} />
        <StatCard label="Extras attach rate" value={`${Math.round(data.attachRate * 100)}%`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="By source">
          <div className="space-y-1 text-sm">
            {data.bySource.map((r) => (
              <div key={r.source} className="flex items-center justify-between"><span>{r.source}</span><Badge variant="secondary">{r.count}</Badge></div>
            ))}
            {!data.bySource.length && <p className="text-muted-foreground">No data.</p>}
          </div>
        </SectionCard>
        <SectionCard title="Room popularity">
          <div className="space-y-1 text-sm">
            {data.byRoom.map((r) => (
              <div key={r.roomId} className="flex items-center justify-between"><span className="truncate">{r.roomId}</span><Badge variant="secondary">{r.count}</Badge></div>
            ))}
            {!data.byRoom.length && <p className="text-muted-foreground">No data.</p>}
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Bookings by day">
        <div className="space-y-1 text-sm">
          {data.byDay.slice(-30).map((r) => (
            <div key={r.day} className="flex items-center justify-between"><span>{r.day}</span><Badge variant="outline">{r.count}</Badge></div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
