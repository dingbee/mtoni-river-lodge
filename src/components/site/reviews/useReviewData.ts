import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReviewAggregates, listApprovedReviews } from "@/lib/reviews.functions";
import { listReviewStatistics } from "@/lib/review-stats.functions";
import type { Review, ReviewAggregate, ReviewCategory, ReviewSource, ReviewStatistics } from "@/lib/reviews";

export function useReviewAggregates() {
  const fn = useServerFn(getReviewAggregates);
  return useQuery<ReviewAggregate[]>({
    queryKey: ["review-aggregates"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReviewStatistics() {
  const fn = useServerFn(listReviewStatistics);
  return useQuery<ReviewStatistics[]>({
    queryKey: ["review-statistics"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
}

export function getStatistic(stats: ReviewStatistics[] | undefined, source: ReviewSource) {
  return stats?.find((s) => s.source === source);
}

export function useApprovedReviews(opts: {
  category?: ReviewCategory;
  source?: ReviewSource;
  featuredOnly?: boolean;
  limit?: number;
} = {}) {
  const fn = useServerFn(listApprovedReviews);
  return useQuery<Review[]>({
    queryKey: ["reviews", opts],
    queryFn: () => fn({ data: { ...opts, limit: opts.limit ?? 50 } }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Combined helper for displays that need both ratings together. */
export function getAggregate(aggregates: ReviewAggregate[] | undefined, source: ReviewSource) {
  return aggregates?.find((a) => a.source === source);
}