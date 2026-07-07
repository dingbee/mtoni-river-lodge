import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Leaf, Mountain, Flame } from "lucide-react";

type Props = {
  img: string;
  img800: string;
  img1600: string;
  alt: string;
};

const HIGHLIGHTS = [
  { Icon: Leaf, label: "Hidden in Nature" },
  { Icon: Mountain, label: "Perfect Before & After Safari" },
  { Icon: Flame, label: "Evenings by the Fire" },
];

export function RiverWritesADay({ img, img800, img1600, alt }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      aria-labelledby="river-writes-heading"
      className="relative isolate h-[62svh] min-h-[460px] w-full overflow-hidden bg-charcoal md:h-[68svh] lg:h-[70svh]"
    >
      {/* Parallax image layer */}
      <motion.div
        style={prefersReducedMotion ? undefined : { y }}
        className="absolute inset-0 -top-[6%] -bottom-[6%] will-change-transform"
      >
        <picture>
          <source
            type="image/webp"
            srcSet={`${img800} 800w, ${img1600} 1600w`}
            sizes="100vw"
          />
          <img
            src={img}
            alt={alt}
            loading="lazy"
            decoding="async"
            width={1824}
            height={1215}
            className={`h-full w-full object-cover ${
              prefersReducedMotion ? "" : "kenburns-slow"
            }`}
          />
        </picture>
      </motion.div>

      {/* Readability gradients */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] items-end px-6 pb-20 text-ivory md:pb-24 lg:items-center lg:px-12 lg:pb-0">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="text-[0.68rem] uppercase tracking-[0.36em] text-ivory/75">
            Welcome to Mtoni
          </p>
          <h2
            id="river-writes-heading"
            className="hero-text-shadow mt-5 font-display text-4xl leading-[1.04] text-ivory sm:text-5xl lg:text-6xl xl:text-7xl"
          >
            Where the River Writes a Day
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ivory/85 lg:text-lg">
            Wake to birdsong. Wander shaded gardens. Pause beside the river. As night falls, gather around the fire beneath an open African sky. Whether arriving before Kilimanjaro, returning from safari, or simply seeking stillness, Mtoni invites you to experience nature at its own rhythm.
          </p>

          <div className="mt-9">
            <Link
              to="/lodge"
              className="group inline-flex items-center gap-3 border-b border-ivory/70 pb-1 text-[0.72rem] uppercase tracking-[0.32em] text-ivory transition-colors hover:border-ivory"
            >
              Discover Our Story
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-ivory/20 pt-6">
            {HIGHLIGHTS.map(({ Icon, label }, i) => (
              <motion.li
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{
                  duration: 0.7,
                  delay: 0.55 + i * 0.12,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
                className="flex items-center gap-3 text-ivory/85"
              >
                <Icon className="h-4 w-4 text-ivory/80" strokeWidth={1.4} aria-hidden />
                <span className="text-[0.72rem] uppercase tracking-[0.24em]">{label}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Soft fade into next section */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-ivory"
        aria-hidden
      />
    </section>
  );
}