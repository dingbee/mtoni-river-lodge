import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getMaintenanceInsights } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/maintenance")({
  component: MaintenanceIntelligence,
});

function MaintenanceIntelligence() {
  const fn = useServerFn(getMaintenanceInsights);
  const q = useQuery({ queryKey: ["ops-maint"], queryFn: () => fn({ data: undefined as any }) });
  const d: any = q.data ?? { repeated: [], delayed: [], total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance Intelligence"
        description={`Analysing last 60 days · ${d.total} maintenance task(s)`}
      />
      <SectionCard title="Repeated issues">
        {d.repeated.length ? (
          <ul className="space-y-2 text-sm">
            {d.repeated.map((r: any, i: number) => (
              <li key={i} className="rounded border p-3">
                <div className="font-medium">{r.sample_title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.occurrences} occurrence(s) — {r.recommendation}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No repeated patterns detected.</p>
        )}
      </SectionCard>
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