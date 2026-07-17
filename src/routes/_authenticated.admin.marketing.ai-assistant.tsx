import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  listPendingAiSuggestions,
  reviewAiSuggestion,
  generateSeoTitle,
  generateSeoMeta,
  generateSeoKeywords,
  generateFaq,
  generateInternalLinks,
  generateAltText,
  generateReviewSummary,
  generateRelatedArticles,
} from "@/domains/marketing/ai/ai-assistant.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/ai-assistant")({
  head: () => ({ meta: [{ title: "AI SEO Assistant — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiAssistant,
});

const KIND_LABELS: Record<string, string> = {
  seo_title: "SEO title",
  seo_meta: "Meta description",
  seo_keywords: "Keywords",
  faq: "FAQ",
  internal_links: "Internal links",
  alt_text: "Alt text",
  testimonial_summary: "Review summary",
  related_articles: "Related articles",
  other: "Other",
};

function AiAssistant() {
  const listFn = useServerFn(listPendingAiSuggestions);
  const reviewFn = useServerFn(reviewAiSuggestion);
  const qc = useQueryClient();

  const { data: pending, isLoading } = useQuery({
    queryKey: ["ai.suggestions.pending"],
    queryFn: () => listFn(),
  });

  const review = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) => reviewFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.decision === "approved" ? "Suggestion approved" : "Suggestion rejected");
      qc.invalidateQueries({ queryKey: ["ai.suggestions.pending"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const counts = (pending ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI SEO Assistant"
        description="Generate on-brand SEO copy, alt text, FAQs and summaries. Every suggestion is queued for human approval before it can be applied."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Pending suggestions" value={String(pending?.length ?? 0)} />
        <StatCard label="SEO drafts" value={String((counts.seo_title ?? 0) + (counts.seo_meta ?? 0) + (counts.seo_keywords ?? 0))} />
        <StatCard label="FAQ / links / alt" value={String((counts.faq ?? 0) + (counts.internal_links ?? 0) + (counts.alt_text ?? 0))} />
        <StatCard label="Review / related" value={String((counts.testimonial_summary ?? 0) + (counts.related_articles ?? 0))} />
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="queue">Approval queue{pending?.length ? ` (${pending.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SeoTitleCard />
            <SeoMetaCard />
            <SeoKeywordsCard />
            <AltTextCard />
            <FaqCard />
            <InternalLinksCard />
            <ReviewSummaryCard />
            <RelatedArticlesCard />
          </div>
        </TabsContent>

        <TabsContent value="queue">
          <SectionCard title="Pending approvals" description="Approve to accept the suggestion. Rejected suggestions are archived and never applied.">
            {isLoading ? (
              <LoadingState />
            ) : !pending?.length ? (
              <p className="text-sm text-muted-foreground">No suggestions waiting. Generate some from the Generate tab.</p>
            ) : (
              <ul className="space-y-3">
                {pending.map((s) => (
                  <li key={s.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{KIND_LABELS[s.kind] ?? s.kind}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {s.target_type} · <span className="font-mono">{s.target_id}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: s.id, decision: "rejected" })} disabled={review.isPending}>
                          <X className="h-4 w-4 mr-1" />Reject
                        </Button>
                        <Button size="sm" onClick={() => review.mutate({ id: s.id, decision: "approved" })} disabled={review.isPending}>
                          <Check className="h-4 w-4 mr-1" />Approve
                        </Button>
                      </div>
                    </div>
                    <pre className="text-xs bg-muted rounded p-2 max-h-72 overflow-auto whitespace-pre-wrap">
{JSON.stringify(s.suggestion, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useGen<T extends Record<string, unknown>>(fn: (args: { data: T }) => Promise<unknown>, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T) => fn({ data: v }),
    onSuccess: () => {
      toast.success(`${label} draft queued for approval`);
      qc.invalidateQueries({ queryKey: ["ai.suggestions.pending"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
}

function GenButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
      Generate
    </Button>
  );
}

function SeoTitleCard() {
  const fn = useServerFn(generateSeoTitle);
  const mut = useGen(fn, "SEO title");
  const [route, setRoute] = useState("/");
  const [ctx, setCtx] = useState("");
  return (
    <SectionCard title="SEO title" description="Suggest a 45–60 char title for a route.">
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); mut.mutate({ routePath: route, context: ctx }); }}
      >
        <Label>Route path</Label>
        <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/experiences/river-safari" />
        <Label>Context (optional)</Label>
        <Textarea rows={2} value={ctx} onChange={(e) => setCtx(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function SeoMetaCard() {
  const fn = useServerFn(generateSeoMeta);
  const mut = useGen(fn, "Meta description");
  const [route, setRoute] = useState("/");
  const [ctx, setCtx] = useState("");
  return (
    <SectionCard title="Meta description" description="Suggest a 120–158 char meta description.">
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); mut.mutate({ routePath: route, context: ctx }); }}
      >
        <Label>Route path</Label>
        <Input value={route} onChange={(e) => setRoute(e.target.value)} />
        <Label>Context (optional)</Label>
        <Textarea rows={2} value={ctx} onChange={(e) => setCtx(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function SeoKeywordsCard() {
  const fn = useServerFn(generateSeoKeywords);
  const mut = useGen(fn, "Keywords");
  const [route, setRoute] = useState("/");
  const [ctx, setCtx] = useState("");
  return (
    <SectionCard title="Keywords" description="Suggest 6–10 target keywords.">
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); mut.mutate({ routePath: route, context: ctx }); }}
      >
        <Label>Route path</Label>
        <Input value={route} onChange={(e) => setRoute(e.target.value)} />
        <Label>Context (optional)</Label>
        <Textarea rows={2} value={ctx} onChange={(e) => setCtx(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function AltTextCard() {
  const fn = useServerFn(generateAltText);
  const mut = useGen(fn, "Alt text");
  const [assetId, setAssetId] = useState("");
  const [filename, setFilename] = useState("");
  const [caption, setCaption] = useState("");
  return (
    <SectionCard title="Alt text" description="Draft accessible alt text from filename + caption.">
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); mut.mutate({ assetId, filename, caption }); }}
      >
        <Label>Asset ID</Label>
        <Input value={assetId} onChange={(e) => setAssetId(e.target.value)} />
        <Label>Filename</Label>
        <Input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="river-terrace-sunset.jpg" />
        <Label>Caption / notes (optional)</Label>
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function FaqCard() {
  const fn = useServerFn(generateFaq);
  const mut = useGen(fn, "FAQ");
  const [topic, setTopic] = useState("");
  const [ctx, setCtx] = useState("");
  return (
    <SectionCard title="FAQ" description="Generate 5–8 questions and answers for a topic.">
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); mut.mutate({ topic, context: ctx }); }}
      >
        <Label>Topic</Label>
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="River view rooms" />
        <Label>Context (optional)</Label>
        <Textarea rows={2} value={ctx} onChange={(e) => setCtx(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function InternalLinksCard() {
  const fn = useServerFn(generateInternalLinks);
  const mut = useGen(fn, "Internal links");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [candidates, setCandidates] = useState("");
  return (
    <SectionCard title="Internal links" description="Suggest anchors from candidate pages.">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = candidates.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
            const [t, h] = l.split("|").map((s) => s.trim());
            return { title: t ?? "", href: h ?? "" };
          }).filter((c) => c.title && c.href);
          mut.mutate({ pageTitle: title, pageBody: body, candidates: parsed });
        }}
      >
        <Label>Source page title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        <Label>Source body</Label>
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <Label>Candidates (one per line: Title | /href)</Label>
        <Textarea rows={4} value={candidates} onChange={(e) => setCandidates(e.target.value)} placeholder={"River Safari | /experiences/river-safari\nRooms | /rooms"} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function ReviewSummaryCard() {
  const fn = useServerFn(generateReviewSummary);
  const mut = useGen(fn, "Review summary");
  const [reviewId, setReviewId] = useState("");
  const [text, setText] = useState("");
  return (
    <SectionCard title="Review summary" description="Short / medium summaries + themes for a review.">
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); mut.mutate({ reviewId, text }); }}
      >
        <Label>Review ID</Label>
        <Input value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
        <Label>Review text</Label>
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}

function RelatedArticlesCard() {
  const fn = useServerFn(generateRelatedArticles);
  const mut = useGen(fn, "Related articles");
  const [articleId, setArticleId] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [candidates, setCandidates] = useState("");
  return (
    <SectionCard title="Related articles" description="Pick 3–5 related journal articles from a candidate list.">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = candidates.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
            const [id, t] = l.split("|").map((s) => s.trim());
            return { id: id ?? "", title: t ?? "" };
          }).filter((c) => c.id && c.title);
          mut.mutate({ articleId, title, excerpt, candidates: parsed });
        }}
      >
        <Label>Source article ID</Label>
        <Input value={articleId} onChange={(e) => setArticleId(e.target.value)} />
        <Label>Source title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        <Label>Excerpt (optional)</Label>
        <Textarea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
        <Label>Candidates (one per line: id | title)</Label>
        <Textarea rows={4} value={candidates} onChange={(e) => setCandidates(e.target.value)} />
        <GenButton pending={mut.isPending} />
      </form>
    </SectionCard>
  );
}