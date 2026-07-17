import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getKnowledgeAnalytics } from "@/domains/ai/knowledge-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/knowledge/analytics")({
  head: () => ({
    meta: [{ title: "Knowledge Analytics — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: KnowledgeAnalyticsPage,
});

function KnowledgeAnalyticsPage() {
  const fn = useServerFn(getKnowledgeAnalytics);
  const q = useQuery({ queryKey: ["knowledge-analytics"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Analytics"
        description="Coverage, search success, and top unanswered questions (last 30 days)."
        actions={
          <div className="flex gap-3 text-sm">
            <Link to="/admin/ai/knowledge/sync" className="underline">
              Sync
            </Link>
            <Link to="/admin/ai/knowledge/test" className="underline">
              Test
            </Link>
          </div>
        }
      />

      {q.data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <SectionCard title="Searches (30d)">
              <div className="text-3xl font-semibold">{q.data.totalSearches}</div>
            </SectionCard>
            <SectionCard title="Success rate">
              <div className="text-3xl font-semibold">{(q.data.successRate * 100).toFixed(0)}%</div>
            </SectionCard>
            <SectionCard title="Avg. confidence">
              <div className="text-3xl font-semibold">{(q.data.avgConfidence * 100).toFixed(0)}%</div>
            </SectionCard>
          </div>

          <SectionCard title="Sources by type">
            <ul className="divide-y text-sm">
              {Object.entries(q.data.counts).map(([type, c]) => (
                <li key={type} className="flex justify-between py-2">
                  <span className="capitalize">{type.replace("_", " ")}</span>
                  <span className="text-muted-foreground">
                    {c.approved} approved · {c.total} total
                  </span>
                </li>
              ))}
              {Object.keys(q.data.counts).length === 0 && (
                <li className="py-2 text-muted-foreground">No sources yet.</li>
              )}
            </ul>
          </SectionCard>

          <SectionCard title="Top unanswered questions">
            {q.data.topUnanswered.length === 0 ? (
              <p className="text-sm text-muted-foreground">All recent queries returned results.</p>
            ) : (
              <ul className="divide-y text-sm">
                {q.data.topUnanswered.map((r) => (
                  <li key={r.query} className="flex justify-between py-2">
                    <span>{r.query}</span>
                    <span className="text-muted-foreground">{r.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}