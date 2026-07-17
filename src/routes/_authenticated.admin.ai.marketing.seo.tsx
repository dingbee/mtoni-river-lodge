import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RecommendationCard } from "@/components/os/ai/RecommendationCard";
import {
  generateSeoRecommendations,
  listMarketingRecommendations,
  actionMarketingRecommendation,
} from "@/domains/ai/marketing-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/seo")({
  head: () => ({ meta: [{ title: "SEO Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMarketingRecommendations);
  const genFn = useServerFn(generateSeoRecommendations);
  const actFn = useServerFn(actionMarketingRecommendation);

  const q = useQuery({
    queryKey: ["ai.marketing.recs", "seo"],
    queryFn: () => listFn({ data: { kind: "seo" } }),
  });

  async function run() {
    try {
      const r = await genFn({ data: { persist: true } });
      toast.success(`Generated ${r.recommendations.length} SEO recommendation(s)`);
      qc.invalidateQueries({ queryKey: ["ai.marketing.recs", "seo"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to run SEO analysis");
    }
  }

  async function act(id: string, action: "accept" | "dismiss" | "convert") {
    await actFn({ data: { id, action } });
    qc.invalidateQueries({ queryKey: ["ai.marketing.recs", "seo"] });
  }

  const rows = (q.data ?? []) as any[];
  return (
    <div className="space-y-4">
      <PageHeader
        title="SEO Intelligence"
        description="Scans seo_overrides + CMS pages for missing metadata, weak titles, missing schema, duplicate titles, and social preview gaps. Nothing is edited automatically."
        actions={<Button onClick={run}>Run SEO analysis</Button>}
      />
      <SectionCard title="Methodology">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Missing title or description → high-impact rewrite.</li>
          <li>Title &lt; 20 or &gt; 65 chars → length adjustment.</li>
          <li>Description &lt; 60 chars → expand for SERP snippet coverage.</li>
          <li>Missing og_image or schema_type → social / rich result gaps.</li>
          <li>Duplicate titles across routes → uniqueness fix.</li>
        </ul>
      </SectionCard>
      <div className="space-y-3">
        {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          rows.length === 0 ? <div className="text-sm text-muted-foreground">No SEO recommendations yet. Run the analysis.</div> :
          rows.map((r) => <RecommendationCard key={r.id} rec={r} onAction={act} />)}
      </div>
    </div>
  );
}

