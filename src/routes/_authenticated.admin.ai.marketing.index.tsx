import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { getMarketingIntelligenceOverview } from "@/domains/ai/marketing-intelligence.functions";
import { Search, FileText, Megaphone, Star, Sparkles, ListChecks, BarChart3, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing/")({
  head: () => ({ meta: [{ title: "Marketing Dashboard — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

const pct = (v: number) => `${Math.round(Number(v || 0) * 100)}%`;

function Page() {
  const fn = useServerFn(getMarketingIntelligenceOverview);
  const q = useQuery({ queryKey: ["ai.marketing.overview"], queryFn: () => fn() });
  const d = q.data as any;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketing Intelligence"
        description="Live health of SEO, content cadence, campaigns, reputation, and brand consistency. Every AI recommendation requires human approval before publishing or launching."
      />
      {q.isLoading || !d ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Search} label="SEO health" value={pct(d.seoHealth)} hint={`${d.indexedRoutes}/${d.seoRoutes} routes indexable · ${d.seoMissingMeta} missing meta`} />
            <StatCard icon={FileText} label="Journal cadence" value={d.journalDaysSinceLast == null ? "—" : `${d.journalDaysSinceLast}d`} hint={`${d.journalPublished} published · health ${pct(d.publishCadenceHealth)}`} />
            <StatCard icon={Megaphone} label="Active campaigns" value={String(d.activeCampaigns)} hint={`${d.totalCampaigns} total`} />
            <StatCard icon={Star} label="Review avg (12mo)" value={`${(d.avgRating ?? 0).toFixed(2)}★`} hint={`${d.reviewsCount} reviews`} />
            <StatCard icon={BarChart3} label="CMS pages" value={String(d.cmsPages)} hint="Public site content" />
            <StatCard icon={Sparkles} label="Brand tokens" value={String(d.brandTokens)} hint="Voice, glossary, palette" />
            <StatCard icon={ListChecks} label="Pending recommendations" value={String(d.pendingRecommendations)} hint={`SEO ${d.pendingByKind.seo} · Content ${d.pendingByKind.content} · Campaigns ${d.pendingByKind.campaign}`} />
            <StatCard icon={CalendarDays} label="Organic visibility" value="—" hint="Connect Search Console for trend" />
          </div>
          <SectionCard title="What each widget means">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li><strong>SEO health</strong> — share of tracked routes with a title and description in seo_overrides.</li>
              <li><strong>Journal cadence</strong> — days since the last published article; healthy is under ~30 days.</li>
              <li><strong>Active campaigns</strong> — running or scheduled campaigns in Campaign Manager.</li>
              <li><strong>Review avg</strong> — mean rating of approved reviews from the last 12 months.</li>
              <li><strong>Brand tokens</strong> — voice / glossary entries the AI compares drafts against.</li>
              <li><strong>Pending recommendations</strong> — SEO / content / campaign suggestions awaiting human review.</li>
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}