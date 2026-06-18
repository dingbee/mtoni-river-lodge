import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import { Stars } from "@/components/site/reviews/Stars";
import { ReviewCard } from "@/components/site/reviews/ReviewCard";
import { ReviewSchema } from "@/components/site/reviews/ReviewSchema";
import {
  useApprovedReviews,
  useReviewAggregates,
  getAggregate,
} from "@/components/site/reviews/useReviewData";
import {
  REVIEW_CATEGORIES,
  TRIPADVISOR_URL,
  GOOGLE_REVIEWS_URL,
  formatReviewCount,
  type ReviewCategory,
  type ReviewSource,
} from "@/lib/reviews";
import heroImg from "@/assets/aerial-lodge.jpg";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Guest Reviews & Experiences — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Real guest reviews of Mtoni River Lodge in Arusha, Tanzania. Verified ratings from Google and Tripadvisor, and stories from travelers around the world.",
      },
      { property: "og:title", content: "Guest Reviews — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "Verified Google and Tripadvisor reviews of Mtoni River Lodge — a riverfront sanctuary on the banks of the Nduruma River.",
      },
      { property: "og:image", content: heroImg },
    ],
    links: [{ rel: "canonical", href: "/reviews" }],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const [source, setSource] = useState<"all" | ReviewSource>("all");
  const [category, setCategory] = useState<"all" | ReviewCategory>("all");

  const { data: reviews = [], isLoading } = useApprovedReviews({ limit: 100 });
  const { data: aggregates } = useReviewAggregates();
  const google = getAggregate(aggregates, "google");
  const ta = getAggregate(aggregates, "tripadvisor");

  const filtered = useMemo(() => {
    return reviews.filter(
      (r) =>
        (source === "all" || r.source === source) &&
        (category === "all" || r.categories.includes(category)),
    );
  }, [reviews, source, category]);

  const featured = reviews.filter((r) => r.featured).slice(0, 6);

  return (
    <div className="bg-ivory text-charcoal">
      <ReviewSchema reviews={reviews} aggregates={aggregates} />
      <SiteHeader overlay />

      <PageHero
        image={heroImg}
        imageAlt="Aerial view of Mtoni River Lodge"
        title="Guest Reviews & Experiences"
        subtitle="Stories shared by travelers who have stayed by the river."
      />

      {/* Summary strip */}
      <section className="px-6 py-16 lg:px-12">
        <div className="mx-auto max-w-[1100px]">
          <Reveal>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { label: "Google", agg: google, url: GOOGLE_REVIEWS_URL, source: "google" as const },
                { label: "Tripadvisor", agg: ta, url: TRIPADVISOR_URL, source: "tripadvisor" as const },
              ].map((it) => (
                <a
                  key={it.label}
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-2xl border border-charcoal/10 bg-bone p-6 transition-all hover:-translate-y-0.5 hover:border-charcoal/20 lg:p-8"
                >
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">
                      {it.label}
                    </p>
                    <p className="mt-3 font-display text-4xl leading-none lg:text-5xl">
                      {it.agg ? it.agg.average_rating.toFixed(1) : "—"}
                      <span className="ml-2 text-base text-charcoal/50">/ 5</span>
                    </p>
                    <div className="mt-3"><Stars rating={it.agg?.average_rating ?? 5} size="md" /></div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl leading-none">
                      {it.agg ? it.agg.review_count : 0}
                    </p>
                    <p className="mt-2 text-[0.6rem] uppercase tracking-[0.28em] text-charcoal/55">
                      Verified reviews
                    </p>
                    <span className="mt-4 inline-block text-[0.65rem] uppercase tracking-[0.24em] underline-offset-8 group-hover:underline">
                      View on {it.label} ↗
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Featured testimonials */}
      {featured.length > 0 && (
        <section className="bg-bone px-6 py-20 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1300px]">
            <Reveal>
              <p className="eyebrow text-charcoal/60">Featured testimonials</p>
              <h2 className="mt-3 font-display text-3xl leading-tight lg:text-5xl">
                Stories the team holds close.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {featured.map((r) => (
                <Reveal key={r.id}>
                  <ReviewCard review={r} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All reviews + filters */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-[1300px]">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <p className="eyebrow text-charcoal/60">All reviews</p>
                <h2 className="mt-3 font-display text-3xl leading-tight lg:text-5xl">
                  Browse by source or category
                </h2>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-4 border-y border-charcoal/10 py-5 lg:flex-row lg:items-center lg:gap-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.6rem] uppercase tracking-[0.28em] text-charcoal/55">Source</span>
                {(["all", "google", "tripadvisor", "direct"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.18em] transition-colors ${
                      source === s
                        ? "border-charcoal bg-charcoal text-ivory"
                        : "border-charcoal/20 text-charcoal/70 hover:border-charcoal/50"
                    }`}
                  >
                    {s === "all" ? "All" : s}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.6rem] uppercase tracking-[0.28em] text-charcoal/55">Category</span>
                <button
                  onClick={() => setCategory("all")}
                  className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.18em] transition-colors ${
                    category === "all"
                      ? "border-charcoal bg-charcoal text-ivory"
                      : "border-charcoal/20 text-charcoal/70 hover:border-charcoal/50"
                  }`}
                >
                  All
                </button>
                {REVIEW_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.18em] transition-colors ${
                      category === c.value
                        ? "border-charcoal bg-charcoal text-ivory"
                        : "border-charcoal/20 text-charcoal/70 hover:border-charcoal/50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-charcoal/5" />
              ))
            ) : filtered.length > 0 ? (
              filtered.map((r) => <ReviewCard key={r.id} review={r} />)
            ) : (
              <p className="col-span-full text-center text-sm text-charcoal/60">
                No reviews match your filters yet.
              </p>
            )}
          </div>

          <div className="mt-16 flex flex-col items-center gap-3">
            <Link
              to="/book"
              className="rounded-full bg-[#2f4a3a] px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-[#243a2d]"
            >
              Plan Your Stay
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}