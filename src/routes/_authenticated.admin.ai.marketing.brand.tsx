import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { reviewBrandCompliance, listBrandReviews } from "@/domains/ai/marketing-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/brand")({
  head: () => ({ meta: [{ title: "Brand Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewBrandCompliance);
  const listFn = useServerFn(listBrandReviews);
  const q = useQuery({ queryKey: ["ai.marketing.brand"], queryFn: () => listFn() });

  const [label, setLabel] = useState("Draft content");
  const [sample, setSample] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (sample.length < 20) { toast.error("Paste at least 20 characters."); return; }
    setLoading(true);
    try {
      await reviewFn({ data: { subject_type: "draft", subject_label: label, content_sample: sample, persist: true } });
      toast.success("Brand review complete");
      qc.invalidateQueries({ queryKey: ["ai.marketing.brand"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  const rows = (q.data ?? []) as any[];
  return (
    <div className="space-y-4">
      <PageHeader title="Brand Intelligence"
        description="Score drafts against Mtoni's brand voice, tone, and glossary. Suggestions only — nothing is edited automatically." />
      <SectionCard title="Methodology">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li><strong>Tone</strong>: penalises off-brand sales phrases, rewards on-brand vocabulary from brand_tokens (category=voice).</li>
          <li><strong>Readability</strong>: sentence length + long-word ratio (Flesch-like heuristic).</li>
          <li><strong>Consistency</strong>: checks preferred/avoided terminology from brand_tokens (category=glossary).</li>
          <li>Composite <strong>brand_score</strong> = tone 40% · readability 30% · consistency 30%.</li>
        </ul>
      </SectionCard>
      <SectionCard title="Score a draft">
        <div className="space-y-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
          <Textarea rows={6} value={sample} onChange={(e) => setSample(e.target.value)}
            placeholder="Paste marketing copy, an article intro, or a campaign line…" />
          <Button onClick={run} disabled={loading}>{loading ? "Scoring…" : "Score draft"}</Button>
        </div>
      </SectionCard>
      <SectionCard title="Recent reviews">
        {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          rows.length === 0 ? <div className="text-sm text-muted-foreground">No brand reviews yet.</div> :
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{r.subject_label ?? r.subject_type}</strong>
                  <Badge variant="outline">brand {Math.round(Number(r.brand_score) * 100)}</Badge>
                  <Badge variant="outline">tone {Math.round(Number(r.tone_score) * 100)}</Badge>
                  <Badge variant="outline">readability {Math.round(Number(r.readability_score) * 100)}</Badge>
                  <Badge variant="outline">consistency {Math.round(Number(r.consistency_score) * 100)}</Badge>
                </div>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Suggestions &amp; issues</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {(r.suggestions as any[]).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                  {(r.issues as any[]).length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-destructive">
                      {(r.issues as any[]).map((s: any, i: number) => <li key={i}>{s.detail}</li>)}
                    </ul>
                  )}
                </details>
              </div>
            ))}
          </div>
        }
      </SectionCard>
    </div>
  );
}