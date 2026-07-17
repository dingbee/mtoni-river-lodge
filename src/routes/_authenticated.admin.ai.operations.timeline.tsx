import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getOperationsTimeline } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/timeline")({
  component: OperationsTimeline,
});

function OperationsTimeline() {
  const fn = useServerFn(getOperationsTimeline);
  const q = useQuery({ queryKey: ["ops-timeline"], queryFn: () => fn({ data: undefined as any }) });

  return (
    <div className="space-y-6">
      <PageHeader title="Operations Timeline" description="Recent Operations AI activity — last 72 hours." />
      <SectionCard title="Activity">
        {q.data && q.data.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {q.data.map((e: any) => (
              <li key={e.id} className="flex justify-between border-b py-1 last:border-0">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>{" "}
                  <span className="ml-2">{e.tool_called.replace(/^operations\./, "")}</span>
                </div>
                <span className="text-xs text-muted-foreground">{e.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        )}
      </SectionCard>
    </div>
  );
}