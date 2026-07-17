import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateReputationInsight, listReputationInsights } from "@/domains/ai/marketing-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/reputation")({
  head: () => ({ meta: [{ title: "Reputation Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const genFn = useServerFn(generateReputationInsight);
  const listFn = useServerFn(listReputationInsights);
  const q = useQuery({ queryKey: ["ai.marketing.reputation"], queryFn: () => listFn() });

  async function run() {
    try {
      await genFn({ data: { persist: true } });
      toast.success("Reputation analysis generated");
      qc.invalidateQueries({ queryKey: ["ai.marketing.reputation"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  const rows = (q.data ?? []) as any[];
  const latest = rows[0];

  return (
    <div className="space-y-4">
      <PageHeader title="Reputation Intelligence"
        description="Aggregates approved reviews across sources, extracts recurring themes, and drafts responses. No responses are posted automatically."
        actions={<Button onClick={run}>Run reputation analysis</Button>} />
      <SectionCard title="Methodology">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Aggregates approved reviews from the last 180 days.</li>
          <li>Extracts theme keywords (compliments / complaints) deterministically.</li>
          <li>Drafts response text for low-rating reviews — draft only.</li>
          <li>Recommends operational and marketing actions from the strongest themes.</li>
        </ul>
      </SectionCard>
      {latest ? (
        <>
          <SectionCard title={`Latest analysis — ${latest.period_from} → ${latest.period_to}`}>
            <p className="text-sm">{latest.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">avg {Number(latest.sentiment_score ?? 0).toFixed(2)}★</Badge>
              <Badge variant="outline">confidence {Math.round(Number(latest.confidence ?? 0) * 100)}%</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium">Compliments</h4>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {(latest.compliments as any[]).map((t) => <Badge key={t.term} variant="secondary">{t.term} · {t.count}</Badge>)}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium">Complaints</h4>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {(latest.complaints as any[]).map((t) => <Badge key={t.term} variant="destructive">{t.term} · {t.count}</Badge>)}
                </ul>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Recommendations">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {(latest.recommendations as any[]).map((r, i) => (
                <li key={i}><strong>{r.title}</strong> — <span className="text-muted-foreground">{r.reason}</span></li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Response drafts (never sent automatically)">
            <div className="space-y-3">
              {(latest.response_drafts as any[]).map((d, i) => (
                <div key={i} className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{d.guest}</span><span>·</span><span>{d.source}</span><span>·</span><span>{d.rating}★</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{d.draft}</p>
                </div>
              ))}
              {(latest.response_drafts as any[]).length === 0 && <p className="text-sm text-muted-foreground">No low-rating reviews to respond to.</p>}
            </div>
          </SectionCard>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">No analyses yet. Run the analysis.</div>
      )}
    </div>
  );
}