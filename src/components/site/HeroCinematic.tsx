import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";

type Source = { src: string; type: string };

type Props = {
  /** Video sources — drop files into public/videos/. First supported type wins. */
  sources?: Source[];
  /** Static fallback shown before/while video loads, or when motion is reduced. */
  poster: string;
  posterAlt: string;
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
export function HeroCinematic({ sources = DEFAULT_SOURCES, poster, posterAlt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [offset, setOffset] = useState(0);

  // Respect reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
    >
      {/* Background media */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{ transform: `translate3d(0, ${offset}px, 0) scale(1.06)` }}
      >
        {/* Poster — always rendered; sits behind the video for instant paint + fallback */}
        <img
          src={poster}
          alt={posterAlt}
          className="ken-burns absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={1080}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        {!reduceMotion && (
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
              Reserve Your Escape
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
          className="absolute bottom-6 right-6 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-ivory/40 bg-black/30 text-ivory backdrop-blur-sm transition-colors hover:bg-black/50 lg:bottom-8 lg:right-10"
        >
          {playing ? <Pause className="h-4 w-4" strokeWidth={1.5} /> : <Play className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      )}

      {/* Scroll cue */}
      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 text-ivory/60 lg:block">
        <span className="block h-12 w-px animate-pulse bg-ivory/50" />
      </div>
    </section>
  );
}
