import { Reveal } from "@/components/site/Reveal";
import { ReviewCard } from "./ReviewCard";
import { Stars } from "./Stars";
import { useApprovedReviews, useReviewAggregates, getAggregate } from "./useReviewData";
import { ReviewSchema } from "./ReviewSchema";

export function RoomReviews({ roomName }: { roomName?: string }) {
  const { data: reviews = [] } = useApprovedReviews({ category: "rooms_comfort", limit: 6 });
  const { data: aggregates } = useReviewAggregates();
  const google = getAggregate(aggregates, "google");
  const ta = getAggregate(aggregates, "tripadvisor");

  if (reviews.length === 0) return null;

  return (
    <section className="border-t border-charcoal/10 bg-bone px-6 py-24 lg:px-12 lg:py-32">
      <ReviewSchema reviews={reviews} aggregates={aggregates} />
      <div className="mx-auto max-w-[1200px]">
        <Reveal>
          <div className="mb-12 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="eyebrow text-charcoal/60">Rooms & Comfort</p>
              <h2 className="mt-3 font-display text-3xl leading-tight lg:text-5xl">
                What guests say about{roomName ? ` ${roomName}` : " our rooms"}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {google && (
                <div className="flex items-center gap-2">
                  <Stars rating={google.average_rating} size="sm" />
                  <span className="text-xs uppercase tracking-[0.24em] text-charcoal/55">
                    {google.average_rating.toFixed(1)} · Google
                  </span>
                </div>
              )}
              {ta && (
                <div className="flex items-center gap-2">
                  <Stars rating={ta.average_rating} size="sm" />
                  <span className="text-xs uppercase tracking-[0.24em] text-charcoal/55">
                    {ta.average_rating.toFixed(1)} · Tripadvisor
                  </span>
                </div>
              )}
            </div>
          </div>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {reviews.slice(0, 3).map((r) => (
            <Reveal key={r.id}>
              <ReviewCard review={r} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}