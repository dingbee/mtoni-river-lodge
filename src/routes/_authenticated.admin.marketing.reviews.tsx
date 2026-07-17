import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listAllReviews, updateReview, getReviewAggregates } from "@/lib/reviews.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/reviews")({
  head: () => ({ meta: [{ title: "Reputation Centre — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Reputation,
});

function Reputation() {
  const listFn = useServerFn(listAllReviews);
  const aggFn = useServerFn(getReviewAggregates);
  const updateFn = useServerFn(updateReview);
  const qc = useQueryClient();

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reputation.reviews"],
    queryFn: () => listFn({ data: { status: "all", source: "all" } }),
  });
  const { data: aggregates } = useQuery({
    queryKey: ["reputation.aggregates"],
    queryFn: () => aggFn(),
  });

  const toggleFeatured = useMutation({
    mutationFn: (v: { id: string; featured: boolean }) => updateFn({ data: { id: v.id, patch: { featured: v.featured } } }),
    onSuccess: () => { toast.success("Review updated"); qc.invalidateQueries({ queryKey: ["reputation.reviews"] }); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const stats = useMemo(() => {
    const list = reviews ?? [];
    const approved = list.filter((r) => r.status === "approved");
    const overall = approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0;
    const bySource: Record<string, { count: number; total: number; sum: number; featured: number }> = {};
    for (const r of list) {
      const k = r.source;
      bySource[k] ??= { count: 0, total: 0, sum: 0, featured: 0 };
      bySource[k].total += 1;
      if (r.status === "approved") { bySource[k].count += 1; bySource[k].sum += r.rating; }
      if (r.featured) bySource[k].featured += 1;
    }
    // trend by month
    const byMonth: Record<string, { sum: number; count: number }> = {};
    for (const r of approved) {
      const m = r.review_date?.slice(0, 7) ?? "";
      if (!m) continue;
      byMonth[m] ??= { sum: 0, count: 0 };
      byMonth[m].sum += r.rating;
      byMonth[m].count += 1;
    }
    const trend = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([m, v]) => ({ month: m, avg: v.sum / v.count, count: v.count }));
    return { overall, bySource, trend, totalApproved: approved.length };
  }, [reviews]);

  const featuredReviews = (reviews ?? []).filter((r) => r.featured);

  return (
    <div className="space-y-6">
      <PageHeader title="Reputation Centre" description="Rating trends, platform comparison and featured reviews." />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Approved reviews" value={String(stats.totalApproved)} />
        <StatCard label="Overall rating" value={stats.overall.toFixed(2)} />
        <StatCard label="Featured" value={String(featuredReviews.length)} />
        <StatCard label="Sources tracked" value={String(Object.keys(stats.bySource).length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Platform comparison" description="Average rating and volume per source (approved only).">
          {isLoading ? <LoadingState /> : (
            <ul className="space-y-3">
              {Object.entries(stats.bySource).map(([source, v]) => {
                const avg = v.count ? v.sum / v.count : 0;
                const external = aggregates?.find((a) => a.source === source);
                return (
                  <li key={source} className="rounded-md border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="capitalize font-medium">{source}</div>
                      <Badge variant="secondary">{v.count} approved / {v.total} total</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{avg.toFixed(2)}</span>
                      {external && (
                        <span className="text-xs text-muted-foreground">External profile: {Number(external.average_rating).toFixed(2)} · {external.review_count}</span>
                      )}
                    </div>
                  </li>
                );
              })}
              {!Object.keys(stats.bySource).length && <li className="text-sm text-muted-foreground">No reviews yet.</li>}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Rating trend" description="12-month average rating over time (approved reviews).">
          {stats.trend.length ? (
            <div className="space-y-2">
              {stats.trend.map((t) => (
                <div key={t.month} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-xs text-muted-foreground font-mono">{t.month}</span>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(t.avg / 5) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right tabular-nums">{t.avg.toFixed(2)} <span className="text-muted-foreground text-xs">({t.count})</span></span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground inline-flex items-center gap-1"><TrendingUp className="h-4 w-4" />Not enough data yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Featured reviews" description="Toggle to feature approved reviews on the public site.">
        {isLoading ? <LoadingState /> : (
          <ul className="space-y-2">
            {(reviews ?? []).filter((r) => r.status === "approved").map((r) => (
              <li key={r.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.guest_name}</span>
                    <Badge variant="secondary" className="capitalize">{r.source}</Badge>
                    <span className="inline-flex items-center gap-0.5 text-amber-500 text-xs">
                      {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.review_date}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.short_summary || r.review_text}</p>
                </div>
                <Button
                  size="sm"
                  variant={r.featured ? "default" : "outline"}
                  onClick={() => toggleFeatured.mutate({ id: r.id, featured: !r.featured })}
                  disabled={toggleFeatured.isPending}
                >
                  {r.featured ? "Featured" : "Feature"}
                </Button>
              </li>
            ))}
            {!reviews?.length && <li className="text-sm text-muted-foreground">No reviews yet.</li>}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}