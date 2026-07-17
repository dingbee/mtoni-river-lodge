import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RecommendationCard } from "@/components/os/ai/RecommendationCard";
import {
  generateCampaignRecommendations,
  listMarketingRecommendations,
  actionMarketingRecommendation,
} from "@/domains/ai/marketing-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/campaigns")({
  head: () => ({ meta: [{ title: "Campaign Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMarketingRecommendations);
  const genFn = useServerFn(generateCampaignRecommendations);
  const actFn = useServerFn(actionMarketingRecommendation);

  const q = useQuery({ queryKey: ["ai.marketing.recs", "campaign"], queryFn: () => listFn({ data: { kind: "campaign" } }) });

  async function run() {
    try {
      const r = await genFn({ data: { persist: true } });
      toast.success(`Generated ${r.recommendations.length} campaign recommendation(s)`);
      qc.invalidateQueries({ queryKey: ["ai.marketing.recs", "campaign"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function act(id: string, action: "accept" | "dismiss" | "convert") {
    await actFn({ data: { id, action } });
    qc.invalidateQueries({ queryKey: ["ai.marketing.recs", "campaign"] });
  }

  const rows = (q.data ?? []) as any[];
  return (
    <div className="space-y-4">
      <PageHeader title="Campaign Intelligence"
        description="Combines forward occupancy, cancellations, review strength, and campaign history to suggest promotions, packages, or awareness plays. Never launches campaigns automatically."
        actions={<Button onClick={run}>Run campaign analysis</Button>} />
      <SectionCard title="Methodology">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Forward occupancy &lt; 45% and no active campaign → acquisition promotion.</li>
          <li>Forward occupancy &gt; 80% → experience-led upsell (protect ADR).</li>
          <li>No campaign in &gt; 60 days → awareness campaign.</li>
          <li>3+ cancellations in 14 days → retention email.</li>
          <li>90-day review avg ≥ 4.6★ → review-showcase campaign.</li>
        </ul>
      </SectionCard>
      <div className="space-y-3">
        {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          rows.length === 0 ? <div className="text-sm text-muted-foreground">No campaign recommendations yet.</div> :
          rows.map((r) => <RecommendationCard key={r.id} rec={r} onAction={act} />)}
      </div>
    </div>
  );
}