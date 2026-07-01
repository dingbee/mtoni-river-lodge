import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

import morningImg from "@/assets/hero-river.jpg";
import riverWalkImg from "@/assets/xp-river-walk.jpg";
import poolImg from "@/assets/pool.jpg";
import diningImg from "@/assets/xp-cooking.jpg";
import bonfireImg from "@/assets/xp-bonfire.jpg";
import firelightImg from "@/assets/rituals.jpg";
import kiliImg from "@/assets/lodge-hero-aerial.jpg";
import maasaiImg from "@/assets/maasai-by-river.jpg";

type Slide = {
  eyebrow: string;
  title: string;
  tagline: string;
  img: string;
  alt: string;
};

const SLIDES: Slide[] = [
  { eyebrow: "Morning Light", title: "Wake to birdsong", tagline: "The river writes the first hour of the day.", img: morningImg, alt: "Mist rising over the Nduruma River at dawn" },
  { eyebrow: "River Walks", title: "Slow adventures", tagline: "Guided paths along the water's edge.", img: riverWalkImg, alt: "Guided river walk along the Nduruma at first light" },
  { eyebrow: "Pool Escape", title: "Refresh. Recharge.", tagline: "A round pool in quiet dialogue with nature.", img: poolImg, alt: "Curved pool framed by thatch and tropical greenery" },
  { eyebrow: "Local Flavours", title: "Taste Tanzania", tagline: "Live-fire cooking, garden herbs, honest plates.", img: diningImg, alt: "Chef preparing a live cooking experience over open flame" },
  { eyebrow: "After Dark", title: "Fire under the sky", tagline: "Evenings gather around the flame.", img: bonfireImg, alt: "Bonfire circle beneath a starlit sky at Mtoni River Lodge" },
  { eyebrow: "By Firelight", title: "Stories. Music. Evenings.", tagline: "Warm rituals as the day settles.", img: firelightImg, alt: "Candlelit evening ritual by firelight" },
  { eyebrow: "Kilimanjaro Base", title: "Rest before the climb", tagline: "A low-altitude sanctuary between summits.", img: kiliImg, alt: "Aerial view of Mtoni River Lodge, a Kilimanjaro base" },
  { eyebrow: "Maasai Heritage", title: "Culture lives here", tagline: "Design and craft rooted in the boma.", img: maasaiImg, alt: "Maasai elder by the river near Mtoni River Lodge" },
];

export function ExperiencesCinematic() {
  const prefersReducedMotion = useReducedMotion();
  const autoplay = useRef(
    Autoplay({ delay: 5500, stopOnInteraction: false, stopOnMouseEnter: true }),
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", dragFree: false },
    [autoplay.current],
  );
  const [selected, setSelected] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setSnapCount(emblaApi.scrollSnapList().length);
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi]);

  return (
    <section
      aria-label="Guest experiences"
      className="relative w-full overflow-hidden bg-charcoal text-ivory"
    >
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {SLIDES.map((s, i) => {
            const isActive = i === selected;
            return (
              <div
                key={s.title}
                className="relative min-w-0 shrink-0 grow-0 basis-full"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}: ${s.title}`}
              >
                <Link
                  to="/experiences"
                  className="group relative block h-[78svh] min-h-[560px] w-full overflow-hidden md:h-[86svh]"
                >
                  <img
                    src={s.img}
                    alt={s.alt}
                    loading="eager"
                    decoding="async"
                    fetchPriority={i === 0 ? "high" : "auto"}
                    className={`absolute inset-0 h-full w-full object-cover will-change-transform transition-transform ease-[cubic-bezier(0.22,0.61,0.36,1)] duration-[8000ms] ${
                      isActive && !prefersReducedMotion ? "scale-[1.08]" : "scale-100"
                    }`}
                  />
                  {/* Cinematic gradient — bottom dark, subtle top vignette */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 px-6 pb-24 md:px-12 md:pb-24 lg:px-20 lg:pb-28">
                    <div className="mx-auto max-w-[1400px]">
                      {isActive && (
                        <motion.div
                          key={`${s.title}-${selected}`}
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
                        >
                          <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05, duration: 0.7 }}
                            className="text-[0.65rem] uppercase tracking-[0.36em] text-ivory/70 md:text-xs"
                          >
                            {s.eyebrow}
                          </motion.p>
                          <motion.h3
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.18, duration: 0.85 }}
                            className="hero-text-shadow mt-4 max-w-3xl font-display text-4xl leading-[1.02] text-ivory md:text-6xl lg:text-7xl"
                          >
                            {s.title}
                          </motion.h3>
                          <motion.p
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.32, duration: 0.8 }}
                            className="mt-5 max-w-lg text-sm leading-relaxed text-ivory/80 md:text-base"
                          >
                            {s.tagline}
                          </motion.p>
                          <motion.span
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.46, duration: 0.7 }}
                            className="mt-8 inline-flex items-center gap-3 border-b border-ivory/60 pb-1 text-[0.7rem] uppercase tracking-[0.32em] text-ivory transition-colors group-hover:border-ivory"
                          >
                            Explore Experiences
                            <span className="transition-transform group-hover:translate-x-1">→</span>
                          </motion.span>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nav arrows */}
      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Previous experience"
        className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-ivory/40 bg-black/25 p-3 text-ivory backdrop-blur-sm transition-all hover:border-ivory hover:bg-black/50 md:left-8 md:p-4"
      >
        <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Next experience"
        className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-ivory/40 bg-black/25 p-3 text-ivory backdrop-blur-sm transition-all hover:border-ivory hover:bg-black/50 md:right-8 md:p-4"
      >
        <ArrowRight className="h-4 w-4 md:h-5 md:w-5" />
      </button>

      {/* Pagination dots */}
      <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-1.5 md:bottom-10 md:gap-2">
        {Array.from({ length: snapCount }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === selected}
            className={`no-min-touch h-1 rounded-full transition-all duration-500 md:h-1.5 ${
              i === selected
                ? "w-5 bg-ivory md:w-8"
                : "w-2 bg-ivory/40 hover:bg-ivory/70 md:w-4"
            }`}
          />
        ))}
      </div>
    </section>
  );
}