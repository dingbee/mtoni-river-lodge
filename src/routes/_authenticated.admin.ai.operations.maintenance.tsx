import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getMaintenanceIntelligence } from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/maintenance")({
  component: MaintenanceIntelligence,
});

function MaintenanceIntelligence() {
  const fn = useServerFn(getMaintenanceIntelligence);
  const q = useQuery({ queryKey: ["ops-maint"], queryFn: () => fn({ data: undefined as any }) });
  const d: any = q.data ?? { recurring: [], delayed: [], highImpactBookings: [], total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance Intelligence"
        description={`Analysing last 60 days · ${d.total} maintenance task(s)`}
      />
      <SectionCard title="Recurring issues" description="Repeated failures over the last 60 days.">
        {d.recurring.length ? (
          <ul className="space-y-2 text-sm">
            {d.recurring.map((r: any, i: number) => (
              <li key={i} className="rounded border p-3">
                <div className="font-medium">{r.sample_title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.occurrences} occurrence(s)
                  {r.avg_resolution_hours ? ` · avg resolution ${r.avg_resolution_hours}h` : ""} · confidence{" "}
                  {Math.round(r.confidence * 100)}%
                </div>
                <div className="mt-1 text-xs">→ {r.recommendation}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recurring patterns detected.</p>
        )}
      </SectionCard>
      {!!d.highImpactBookings?.length && (
        <SectionCard title="High-impact bookings" description="Bookings with 3+ maintenance tasks in the window.">
          <ul className="space-y-1 text-sm">
            {d.highImpactBookings.map((b: any) => (
              <li key={b.booking_id} className="flex justify-between border-b py-1 last:border-0">
                <span className="font-mono text-xs">{b.booking_id.slice(0, 8)}…</span>
                <span className="text-xs text-muted-foreground">{b.count} tasks</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <SectionCard title="Delayed tasks">
        {d.delayed.length ? (
          <ul className="space-y-1 text-sm">
            {d.delayed.map((t: any) => (
              <li key={t.id} className="flex justify-between border-b py-1 last:border-0">
                <span>{t.title}</span>
                <span className="text-xs text-amber-600">{t.overdue_days}d overdue</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No delayed maintenance.</p>
        )}
      </SectionCard>
    </div>
  );
}