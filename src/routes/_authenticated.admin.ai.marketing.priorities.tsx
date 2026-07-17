import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateWeeklyPriorities, listMarketingPriorities } from "@/domains/ai/marketing-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/priorities")({
  head: () => ({ meta: [{ title: "Weekly Priorities — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const genFn = useServerFn(generateWeeklyPriorities);
  const listFn = useServerFn(listMarketingPriorities);
  const q = useQuery({ queryKey: ["ai.marketing.priorities"], queryFn: () => listFn() });

  async function run() {
    try {
      await genFn({ data: { persist: true } });
      toast.success("Weekly priorities generated");
      qc.invalidateQueries({ queryKey: ["ai.marketing.priorities"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const rows = (q.data ?? []) as any[];
  const latest = rows[0];

  return (
    <div className="space-y-4">
      <PageHeader title="Weekly Marketing Priorities"
        description="Ranked list of the highest impact × confidence recommendations across SEO, content, campaigns, and reputation. Executive summary only — nothing acts autonomously."
        actions={<Button onClick={run}>Generate this week</Button>} />
      {latest ? (
        <SectionCard title={`Week of ${latest.week_start}`}>
          <p className="text-sm">{latest.summary}</p>
          <div className="mt-3 space-y-2">
            {(latest.priorities as any[]).map((p, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{i + 1}. {p.title}</strong>
                  <Badge variant="outline">{p.kind}</Badge>
                  <Badge variant="outline">confidence {Math.round(Number(p.confidence ?? 0) * 100)}%</Badge>
                  <Badge variant="outline">score {Number(p.score ?? 0).toFixed(1)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{p.reason}</p>
                {p.expected_impact && <p className="mt-1 text-xs text-muted-foreground"><strong>Expected impact:</strong> {p.expected_impact}</p>}
              </div>
            ))}
            {(latest.priorities as any[]).length === 0 && <p className="text-sm text-muted-foreground">Nothing pending — run the SEO, content, or campaign scans to refresh.</p>}
          </div>
        </SectionCard>
      ) : (
        <div className="text-sm text-muted-foreground">No weekly summary yet. Generate one.</div>
      )}

      {rows.slice(1).length > 0 && (
        <SectionCard title="Previous weeks">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {rows.slice(1).map((r) => <li key={r.id}>{r.week_start} — {r.summary}</li>)}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}