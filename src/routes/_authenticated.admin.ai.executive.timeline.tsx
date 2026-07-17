import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { getExecutiveTimeline } from "@/domains/ai/executive-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/executive/timeline")({
  head: () => ({ meta: [{ title: "Executive Timeline — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getExecutiveTimeline);
  const q = useQuery({ queryKey: ["ai.exec.timeline"], queryFn: () => fn() });
  const items = (q.data as any[]) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Timeline"
        description="Chronological AI activity — recommendations, approvals, generations, and cross-domain decisions."
      />
      <SectionCard title={`Recent activity (${items.length})`}>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
         items.length === 0 ? <p className="text-sm text-muted-foreground">No AI activity yet.</p> : (
          <ul className="space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.id} className="rounded border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{it.tool_called ?? "ai"}</Badge>
                  {(it.domains_accessed ?? []).map((d: string) => <Badge key={d} variant="secondary">{d}</Badge>)}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(it.created_at).toLocaleString()}</span>
                </div>
                {it.question && <div className="mt-1 font-medium">{it.question}</div>}
                {it.response && <div className="mt-1 text-muted-foreground">{String(it.response).slice(0, 240)}</div>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}