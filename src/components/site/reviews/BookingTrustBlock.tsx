import { ShieldCheck, Heart, KeyRound } from "lucide-react";
import { Stars } from "./Stars";
import { ReviewCard } from "./ReviewCard";
import { useApprovedReviews, useReviewAggregates, getAggregate } from "./useReviewData";
import { TRIPADVISOR_URL, GOOGLE_REVIEWS_URL, formatReviewCount } from "@/lib/reviews";

export function BookingTrustBlock() {
  const { data: aggregates } = useReviewAggregates();
  const { data: reviews = [] } = useApprovedReviews({ featuredOnly: true, limit: 3 });
  const google = getAggregate(aggregates, "google");
  const ta = getAggregate(aggregates, "tripadvisor");

  return (
    <section aria-label="Why guests book direct" className="border-y border-charcoal/10 bg-bone px-6 py-10 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <p className="eyebrow text-charcoal/60">Trusted by travelers</p>
            <h2 className="mt-3 font-display text-2xl leading-snug lg:text-3xl">
              Book direct with confidence.
            </h2>

            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
              {google && (
                <a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-80">
                  <span className="font-display text-2xl leading-none">{google.average_rating.toFixed(1)}</span>
                  <div>
                    <Stars rating={google.average_rating} size="xs" />
                    <p className="mt-1 text-[0.6rem] uppercase tracking-[0.24em] text-charcoal/55">
                      Google · {formatReviewCount(google.review_count, "google")} reviews
                    </p>
                  </div>
                </a>
              )}
              {ta && (
                <a href={TRIPADVISOR_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-80">
                  <span className="font-display text-2xl leading-none">{ta.average_rating.toFixed(1)}</span>
                  <div>
                    <Stars rating={ta.average_rating} size="xs" />
                    <p className="mt-1 text-[0.6rem] uppercase tracking-[0.24em] text-charcoal/55">
                      Tripadvisor · {formatReviewCount(ta.review_count, "tripadvisor")} reviews
                    </p>
                  </div>
                </a>
              )}
            </div>

            <ul className="mt-7 space-y-3 text-sm text-charcoal/75">
              {[
                { Icon: ShieldCheck, text: "Best rate guaranteed — book directly with the lodge" },
                { Icon: KeyRound, text: "Flexible cancellation up to 14 days before arrival" },
                { Icon: Heart, text: "Personal hosting from a small, dedicated team" },
              ].map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#2f4a3a]" strokeWidth={1.6} />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.slice(0, 3).map((r) => (
                <ReviewCard key={r.id} review={r} compact />
              ))}
              {reviews.length === 0 && (
                <p className="col-span-full rounded-2xl border border-dashed border-charcoal/15 p-6 text-center text-sm text-charcoal/60">
                  Featured guest reviews appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}