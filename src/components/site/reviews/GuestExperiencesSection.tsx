import { useMemo } from "react";
import { Reveal } from "@/components/site/Reveal";
import { Link } from "@tanstack/react-router";
import { ReviewCard } from "./ReviewCard";
import { Stars } from "./Stars";
import { useApprovedReviews, useReviewAggregates, getAggregate } from "./useReviewData";
import { ReviewSchema } from "./ReviewSchema";
import { CATEGORY_LABELS, formatReviewCount, type ReviewCategory } from "@/lib/reviews";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Review } from "@/lib/reviews";

const HOMEPAGE_GROUPS: { key: ReviewCategory; eyebrow: string; copy: string }[] = [
  {
    key: "hospitality_service",
    eyebrow: "Hospitality & Service",
    copy: "Warmth that lingers long after the journey ends.",
  },
  {
    key: "tranquility_nature",
    eyebrow: "Tranquility & Nature",
    copy: "Mornings of mist and birdsong, days set to the river’s pace.",
  },
  {
    key: "safari_gateway",
    eyebrow: "Safari Gateway",
    copy: "The calm before — and after — the great northern circuit.",
  },
];

function CategoryCarousel({ items }: { items: Review[] }) {
  return (
    <Carousel
      opts={{ align: "start", containScroll: "trimSnaps", dragFree: false }}
      className="w-full min-w-0"
    >
      <CarouselContent className="-ml-4">
        {items.map((r) => (
          <CarouselItem
            key={r.id}
            className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
          >
            <div className="h-full">
              <ReviewCard review={r} />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden lg:-left-4 lg:flex" />
      <CarouselNext className="hidden lg:-right-4 lg:flex" />
    </Carousel>
  );
}

export function GuestExperiencesSection() {
  const { data: reviews = [] } = useApprovedReviews({ limit: 60 });
  const { data: aggregates } = useReviewAggregates();
  const google = getAggregate(aggregates, "google");
  const ta = getAggregate(aggregates, "tripadvisor");

  const byCategory = useMemo(() => {
    const map = new Map<ReviewCategory, typeof reviews>();
    for (const r of reviews) {
      for (const c of r.categories) {
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(r);
      }
    }
    return map;
  }, [reviews]);

  const featuredForSchema = reviews.filter((r) => r.featured).slice(0, 12);

  const visibleGroups = HOMEPAGE_GROUPS
    .map((g) => ({ group: g, items: (byCategory.get(g.key) ?? []).slice(0, 9) }))
    .filter((g) => g.items.length > 0);

  const defaultMobileOpen = visibleGroups[0]?.group.key;

  return (
    <section
      id="guest-experiences"
      className="relative overflow-hidden px-6 py-16 lg:px-12 lg:py-24"
      style={{
        backgroundImage:
          "radial-gradient(1200px 600px at 15% 0%, rgba(180,160,120,0.10), transparent 60%), radial-gradient(900px 500px at 90% 100%, rgba(120,140,110,0.10), transparent 60%)",
        backgroundColor: "#f5f0e8",
      }}
    >
      <ReviewSchema reviews={featuredForSchema} aggregates={aggregates} />

      <div className="relative mx-auto max-w-[1300px]">
        <div className="mx-auto max-w-[820px] text-center">
          <Reveal>
            <p className="eyebrow text-charcoal/60">Guest Experiences</p>
            <h2 className="mt-4 font-display text-3xl leading-[1.1] sm:text-4xl lg:text-5xl">
              Memorable stays shared by travelers from around the world.
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-y border-charcoal/15 py-4">
              {google && (
                <div className="flex items-center gap-3">
                  <span className="font-display text-3xl leading-none">{google.average_rating.toFixed(1)}</span>
                  <div className="flex flex-col gap-1">
                    <Stars rating={google.average_rating} size="sm" />
                    <span className="text-[0.62rem] uppercase tracking-[0.28em] text-charcoal/55">
                      Google · {formatReviewCount(google.review_count, "google")} reviews
                    </span>
                  </div>
                </div>
              )}
              {ta && (
                <div className="flex items-center gap-3">
                  <span className="font-display text-3xl leading-none">{ta.average_rating.toFixed(1)}</span>
                  <div className="flex flex-col gap-1">
                    <Stars rating={ta.average_rating} size="sm" />
                    <span className="text-[0.62rem] uppercase tracking-[0.28em] text-charcoal/55">
                      Tripadvisor · {formatReviewCount(ta.review_count, "tripadvisor")} reviews
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>

        {/* Desktop / tablet: stacked carousels */}
        <div className="mt-12 hidden space-y-14 md:block lg:mt-16 lg:space-y-16">
          {visibleGroups.map(({ group, items }, gi) => (
            <Reveal key={group.key} delay={gi * 80}>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow text-charcoal/60">{group.eyebrow}</p>
                  <p className="mt-2 font-display text-xl text-charcoal/85 lg:text-2xl">{group.copy}</p>
                </div>
                <Link
                  to="/reviews"
                  className="text-[0.7rem] uppercase tracking-[0.28em] underline-offset-8 hover:underline"
                >
                  All {CATEGORY_LABELS[group.key].toLowerCase()} reviews →
                </Link>
              </div>
              <CategoryCarousel items={items} />
            </Reveal>
          ))}
        </div>

        {/* Mobile: collapsible accordion, one open at a time */}
        <div className="mt-10 md:hidden">
          <Accordion
            type="single"
            collapsible
            defaultValue={defaultMobileOpen}
            className="space-y-3"
          >
            {visibleGroups.map(({ group, items }) => (
              <AccordionItem
                key={group.key}
                value={group.key}
                className="rounded-2xl border border-charcoal/10 bg-ivory/70 px-4"
              >
                <AccordionTrigger className="py-4 text-left hover:no-underline">
                  <div>
                    <p className="eyebrow text-charcoal/60">{group.eyebrow}</p>
                    <p className="mt-1 font-display text-base text-charcoal/85">{group.copy}</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <CategoryCarousel items={items} />
                  <Link
                    to="/reviews"
                    className="mt-4 inline-block text-[0.65rem] uppercase tracking-[0.26em] underline-offset-8 hover:underline"
                  >
                    All {CATEGORY_LABELS[group.key].toLowerCase()} reviews →
                  </Link>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <Reveal delay={200}>
          <div className="mt-12 flex flex-col items-center gap-4 lg:mt-16">
            <Link
              to="/reviews"
              className="group inline-flex items-center gap-3 rounded-full bg-[#2f4a3a] px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory shadow-[0_20px_40px_-20px_rgba(47,74,58,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#243a2d]"
            >
              Read All Guest Reviews
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}