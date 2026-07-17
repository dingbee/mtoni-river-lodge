import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { getMarketingAnalytics } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/marketing")({
  head: () => ({ meta: [{ title: "Marketing Analytics — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getMarketingAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.marketing"], queryFn: () => fn({ data: undefined as any }) });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Marketing Analytics" description="Campaign performance, reviews, and content signals." />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Active campaigns (30d)" value={data.campaigns} />
        <StatCard label="New reviews" value={data.reviewCount} />
        <StatCard label="Avg review" value={data.avgReview ? data.avgReview.toFixed(2) : "—"} />
        <StatCard label="SEO recommendations" value={data.seoRecommendations} />
      </div>
      <SectionCard title="Recent journal articles">
        <div className="space-y-1 text-sm">
          {data.topArticles.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between">
              <span>{a.title}</span>
              <span className="text-muted-foreground">{a.published_at?.slice(0, 10)}</span>
            </div>
          ))}
          {!data.topArticles.length && <p className="text-muted-foreground">No articles yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
