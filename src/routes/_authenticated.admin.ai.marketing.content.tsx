import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RecommendationCard } from "@/components/os/ai/RecommendationCard";
import {
  generateContentRecommendations,
  listMarketingRecommendations,
  actionMarketingRecommendation,
} from "@/domains/ai/marketing-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/content")({
  head: () => ({ meta: [{ title: "Content Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMarketingRecommendations);
  const genFn = useServerFn(generateContentRecommendations);
  const actFn = useServerFn(actionMarketingRecommendation);

  const q = useQuery({ queryKey: ["ai.marketing.recs", "content"], queryFn: () => listFn({ data: { kind: "content" } }) });

  async function run() {
    try {
      const r = await genFn({ data: { persist: true } });
      toast.success(`Generated ${r.recommendations.length} content recommendation(s)`);
      qc.invalidateQueries({ queryKey: ["ai.marketing.recs", "content"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function act(id: string, action: "accept" | "dismiss" | "convert") {
    await actFn({ data: { id, action } });
    qc.invalidateQueries({ queryKey: ["ai.marketing.recs", "content"] });
  }

  const rows = (q.data ?? []) as any[];
  return (
    <div className="space-y-4">
      <PageHeader title="Content Intelligence"
        description="Analyses journal cadence, article freshness, article-level SEO, and forward booking demand to suggest new topics, refreshes, and seasonal pages. Nothing is published automatically."
        actions={<Button onClick={run}>Run content analysis</Button>} />
      <SectionCard title="Methodology">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Publishing gap &gt; 30 days → new-topic brief with outline, keywords, FAQs.</li>
          <li>Articles &gt; 180 days old → refresh checklist.</li>
          <li>Articles missing seo_title / seo_description → SEO-alignment task.</li>
          <li>Forward bookings signal seasonal demand → landing page suggestion.</li>
        </ul>
      </SectionCard>
      <div className="space-y-3">
        {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          rows.length === 0 ? <div className="text-sm text-muted-foreground">No content recommendations yet.</div> :
          rows.map((r) => <RecommendationCard key={r.id} rec={r} onAction={act} />)}
      </div>
    </div>
  );
}