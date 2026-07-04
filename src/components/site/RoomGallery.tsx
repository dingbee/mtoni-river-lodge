import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoomGalleryImage = {
  src: string;
  alt: string;
};

type Props = {
  images: RoomGalleryImage[];
  aspect?: string;
  className?: string;
};

/**
 * Interactive room gallery — swipe on mobile, drag or arrows on desktop,
 * with pagination dots and image counter. First image eager for LCP;
 * remaining images lazy-load.
 */
export function RoomGallery({ images, aspect = "aspect-[4/5] lg:aspect-[5/6]", className }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start", duration: 32 });
  const [selected, setSelected] = useState(0);

  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  if (images.length === 0) return null;

  const total = images.length;
  const single = total === 1;

  return (
    <div className={cn("group relative overflow-hidden", aspect, className)}>
      <div ref={emblaRef} className="h-full w-full overflow-hidden">
        <div className="flex h-full">
          {images.map((img, i) => (
            <div
              key={img.src + i}
              className="relative h-full min-w-0 flex-[0_0_100%]"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${total}`}
            >
              <img
                src={img.src}
                alt={img.alt}
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                decoding={i === 0 ? "sync" : "async"}
                fetchPriority={i === 0 ? "high" : "auto"}
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {!single && (
        <>
          {/* Arrows — desktop hover, always tappable on mobile */}
          <button
            type="button"
            onClick={scrollPrev}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-ivory/85 p-2 text-charcoal opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-500 hover:bg-ivory group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100 lg:left-4"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-ivory/85 p-2 text-charcoal opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-500 hover:bg-ivory group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100 lg:right-4"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/* Counter */}
          <div className="absolute right-3 top-3 rounded-full bg-charcoal/55 px-3 py-1 text-[0.65rem] uppercase tracking-[0.24em] text-ivory backdrop-blur-sm lg:right-4 lg:top-4">
            {selected + 1} / {total}
          </div>

          {/* Dots */}
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollTo(i)}
                aria-label={`Go to image ${i + 1}`}
                aria-current={selected === i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  selected === i ? "w-6 bg-ivory" : "w-1.5 bg-ivory/55 hover:bg-ivory/80"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}