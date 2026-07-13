import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpsTimeline } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";

export const Route = createFileRoute("/_authenticated/admin/operations/timeline")({
  head: () => ({ meta: [{ title: "Ops Timeline — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: TimelinePage,
});

function TimelinePage() {
  const fn = useServerFn(getOpsTimeline);
  const q = useQuery({ queryKey: ["ops-timeline"], queryFn: () => fn({ data: { limit: 80 } }), staleTime: 15_000, refetchInterval: 30_000 });
  const rows: any[] = (q.data as any) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="Daily Operations Timeline" description="Live feed of every operational event." />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : (
        <ol className="space-y-1 border-l pl-4">
          {rows.map((r) => (
            <li key={r.id} className="relative py-2 text-sm">
              <span className="absolute -left-[9px] top-3 size-2 rounded-full bg-primary" />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{r.action}</span>
                <span className="text-xs text-muted-foreground">{r.module}</span>
                {r.entity_label && <span className="text-xs text-muted-foreground">· {r.entity_label}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              {r.actor_email && <div className="text-xs text-muted-foreground">by {r.actor_email}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}