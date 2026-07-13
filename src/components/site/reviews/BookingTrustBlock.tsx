import { ShieldCheck, Heart, KeyRound } from "lucide-react";
import { ReviewCard } from "./ReviewCard";
import { useApprovedReviews } from "./useReviewData";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export function BookingTrustBlock() {
  const { data: reviews = [] } = useApprovedReviews({ featuredOnly: true, limit: 9 });

  return (
    <section aria-label="Why guests book direct" className="border-y border-charcoal/10 bg-bone px-6 py-10 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <p className="eyebrow text-charcoal/60">Trusted by travelers</p>
            <h2 className="mt-3 font-display text-2xl leading-snug lg:text-3xl">
              Book direct with confidence.
            </h2>

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

          <div className="min-w-0 lg:col-span-7">
            <Carousel
              opts={{ align: "start", containScroll: "trimSnaps", dragFree: false }}
              className="w-full"
            >
              <CarouselContent className="-ml-4">
                {reviews.map((r) => (
                  <CarouselItem
                    key={r.id}
                    className="basis-full pl-4 sm:basis-1/2 xl:basis-1/3"
                  >
                    <div className="h-full">
                      <ReviewCard review={r} compact />
                    </div>
                  </CarouselItem>
                ))}
                {reviews.length === 0 && (
                  <CarouselItem className="basis-full pl-4">
                    <p className="rounded-2xl border border-dashed border-charcoal/15 p-6 text-center text-sm text-charcoal/60">
                      Featured guest reviews appear here.
                    </p>
                  </CarouselItem>
                )}
              </CarouselContent>
              <CarouselPrevious className="hidden lg:-left-4 lg:flex" />
              <CarouselNext className="hidden lg:-right-4 lg:flex" />
            </Carousel>
          </div>
        </div>
      </div>
    </section>
  );
}
