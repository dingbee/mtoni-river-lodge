import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";

type Source = { src: string; type: string };

export type HeroPoster = {
  src: string;
  alt: string;
  /** Optional WebP variant at ~800w for mobile. */
  webp800?: string;
  /** Optional WebP variant at ~1600w for desktop. */
  webp1600?: string;
};

type Props = {
  /** Video sources — drop files into public/videos/. First supported type wins. */
  sources?: Source[];
  /** Static fallback shown before/while video loads, or when motion is reduced. */
  poster: string;
  posterAlt: string;
  /** Optional additional posters to cross-fade with the primary poster. */
  posters?: HeroPoster[];
  /** Seconds each slide is shown before dissolving. */
  slideDurationMs?: number;
};

const DEFAULT_SOURCES: Source[] = [
  { src: "/videos/mtoni-hero.webm", type: "video/webm" },
  { src: "/videos/mtoni-hero.mp4", type: "video/mp4" },
];

/**
 * Cinematic homepage hero — looping silent video background with
 * warm color grading, slow zoom, scroll parallax, and a soft dark
 * gradient overlay. Falls back to the poster image on reduced-motion
 * or when the video cannot play.
 */
export function HeroCinematic({
  sources = DEFAULT_SOURCES,
  poster,
  posterAlt,
  posters,
  slideDurationMs = 9000,
}: Props) {
  const slides = (posters && posters.length > 0
    ? posters
    : [{ src: poster, alt: posterAlt } as HeroPoster]);
  const [activeSlide, setActiveSlide] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  // Defer mounting non-first slides until after the page has loaded so the
  // mobile LCP isn't competing with extra image downloads.
  const [mountRest, setMountRest] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // On mobile, never mount the additional slides at all — keeps the LCP
    // candidate fighting only one image download.
    if (window.matchMedia("(max-width: 767px)").matches) return;
    if (document.readyState === "complete") {
      const id = window.setTimeout(() => setMountRest(true), 400);
      return () => window.clearTimeout(id);
    }
    const onLoad = () => window.setTimeout(() => setMountRest(true), 400);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // Respect reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Skip the background video on mobile — it's ~MBs of data and decode cost
  // that hurts LCP/TBT on Android. The poster image carries the hero alone.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Pause autoplay when tab is hidden
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Cross-fade between posters when video isn't covering them
  useEffect(() => {
    if (slides.length < 2) return;
    if (videoReady && !reduceMotion) return;
    if (hovered || !tabVisible) return;
    const id = window.setInterval(() => {
      setActiveSlide((i) => (i + 1) % slides.length);
    }, slideDurationMs);
    return () => window.clearInterval(id);
  }, [slides.length, slideDurationMs, videoReady, reduceMotion, hovered, tabVisible]);

  // Subtle parallax on scroll (rAF-throttled)
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const el = sectionRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) {
            // Move background down ~20% of scroll within viewport
            setOffset(Math.max(-120, Math.min(120, -rect.top * 0.18)));
          }
        }
        raf = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Pause when offscreen for performance
  useEffect(() => {
    const el = sectionRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          v.pause();
        } else if (playing && !reduceMotion) {
          v.play().catch(() => {});
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [playing, reduceMotion]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="relative mb-20 h-[88svh] min-h-[640px] w-full overflow-hidden bg-charcoal"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Background media */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{ transform: `translate3d(0, ${offset}px, 0) scale(1.06)` }}
      >
        {/* Posters — cross-fade between multiple signature atmospheres */}
        {slides.map((s, i) => {
          // Only the first slide renders on first paint; the rest mount after
          // window.load to avoid stealing bandwidth from the LCP image.
          if (i !== 0 && !mountRest) return null;
          const srcSet = s.webp800 || s.webp1600
            ? [s.webp800 ? `${s.webp800} 800w` : null, s.webp1600 ? `${s.webp1600} 1600w` : null]
                .filter(Boolean)
                .join(", ")
            : undefined;
          return (
            <picture key={s.src}>
              {srcSet && (
                <source
                  type="image/webp"
                  srcSet={srcSet}
                  sizes="100vw"
                />
              )}
              <img
                src={s.src}
                alt={s.alt}
                className={`ken-burns absolute inset-0 h-full w-full object-cover transition-opacity duration-[2400ms] ease-in-out ${
                  i === activeSlide ? "opacity-100" : "opacity-0"
                }`}
                width={1920}
                height={1080}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={i === 0 ? "high" : "low"}
              />
            </picture>
          );
        })}
        {!reduceMotion && !isMobile && (
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
            style={{ filter: "saturate(1.05) contrast(1.02) brightness(0.95)" }}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={poster}
            onCanPlay={() => setVideoReady(true)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            aria-hidden
          >
            {sources.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
          </video>
        )}
      </div>

      {/* Warm cinematic color grade */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-soft-light"
        style={{
          background:
            "linear-gradient(180deg, rgba(64,48,28,0.35) 0%, rgba(32,46,32,0.25) 50%, rgba(20,28,22,0.45) 100%)",
        }}
      />
      {/* Readability gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/75" />
      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]" />

      {/* Overlay content — centered, spacious */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1100px] flex-col items-center justify-center px-6 pt-[110px] text-center text-ivory lg:px-12 lg:pt-[140px]">
        <Reveal>
          <p className="eyebrow hero-text-shadow !text-ivory/80">Arusha · Tanzania</p>
        </Reveal>
        <Reveal delay={220}>
          <h1 className="hero-text-shadow mt-6 font-display text-[3rem] leading-[1.02] tracking-tight text-ivory sm:text-6xl lg:text-[6rem]">
            Hidden <em className="font-light italic">in</em> Nature
          </h1>
        </Reveal>
        <Reveal delay={420}>
          <p className="hero-text-shadow mt-7 max-w-[620px] text-base leading-relaxed text-ivory/90 lg:text-lg">
            A luxury riverfront escape in Arusha — where Maasai craft, forest light,
            and the slow rhythm of the Nduruma River shape every quiet hour.
          </p>
        </Reveal>
        <Reveal delay={620}>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
            <Link
              to="/book"
              className="group inline-flex items-center gap-3 border border-ivory bg-ivory px-8 py-4 text-[0.72rem] font-medium uppercase tracking-[0.3em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
            >
              Check Availability
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/rooms"
              className="group inline-flex items-center gap-3 border border-ivory/70 bg-transparent px-8 py-4 text-[0.72rem] font-medium uppercase tracking-[0.3em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
            >
              Explore Rooms
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Play / pause control */}
      {!reduceMotion && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause background video" : "Play background video"}
          className="absolute bottom-6 right-6 z-20 hidden h-11 w-11 items-center justify-center rounded-full border border-ivory/40 bg-black/30 text-ivory backdrop-blur-sm transition-colors hover:bg-black/50 lg:bottom-8 lg:right-10"
        >
          {playing ? <Pause className="h-4 w-4" strokeWidth={1.5} /> : <Play className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      )}

      {/* Slide navigation — arrows (desktop) + dots (all) */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setActiveSlide((i) => (i - 1 + slides.length) % slides.length)}
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ivory/30 bg-black/20 text-ivory/80 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-ivory md:inline-flex lg:left-8"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.4} />
          </button>
          <button
            type="button"
            onClick={() => setActiveSlide((i) => (i + 1) % slides.length)}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ivory/30 bg-black/20 text-ivory/80 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-ivory md:inline-flex lg:right-8"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.4} />
          </button>
          <div className="absolute inset-x-0 bottom-7 z-20 flex justify-center gap-1.5 lg:bottom-10 lg:gap-2">
            {slides.map((s, i) => (
              <button
                key={s.src}
                type="button"
                onClick={() => setActiveSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === activeSlide}
                className={`no-min-touch h-1 rounded-full transition-all duration-500 lg:h-1.5 ${
                  i === activeSlide
                    ? "w-5 bg-ivory lg:w-8"
                    : "w-2 bg-ivory/40 hover:bg-ivory/70 lg:w-4"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
