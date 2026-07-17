import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getTaskIntelligence } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/tasks")({
  component: TaskIntelligence,
});

function TaskIntelligence() {
  const fn = useServerFn(getTaskIntelligence);
  const q = useQuery({ queryKey: ["ops-task-intel"], queryFn: () => fn({ data: undefined as any }) });
  const d: any = q.data ?? { overdue: [], highImpact: [], bottleneck: [], total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader title="Operations Task Intelligence" description={`${d.total} open task(s)`} />
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={`Overdue (${d.overdue.length})`}>
          <ul className="space-y-1 text-sm">
            {d.overdue.map((t: any) => (
              <li key={t.id} className="border-b py-1 last:border-0">{t.title}</li>
            ))}
            {!d.overdue.length && <li className="text-muted-foreground">None</li>}
          </ul>
        </SectionCard>
        <SectionCard title={`High impact (${d.highImpact.length})`}>
          <ul className="space-y-1 text-sm">
            {d.highImpact.map((t: any) => (
              <li key={t.id} className="border-b py-1 last:border-0">{t.title}</li>
            ))}
            {!d.highImpact.length && <li className="text-muted-foreground">None</li>}
          </ul>
        </SectionCard>
      </div>
      <SectionCard title="Bottlenecks by category">
        <ul className="space-y-1 text-sm">
          {d.bottleneck.map((b: any) => (
            <li key={b.category} className="flex justify-between border-b py-1 last:border-0">
              <span className="capitalize">{b.category}</span>
              <span className="text-muted-foreground">{b.open} open</span>
            </li>
          ))}
          {!d.bottleneck.length && <li className="text-muted-foreground">No open tasks.</li>}
        </ul>
      </SectionCard>
    </div>
  );
}