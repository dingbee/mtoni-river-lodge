import { motion, useReducedMotion } from "framer-motion";
import { TreePine, Plane, Flame } from "lucide-react";

type Pillar = {
  Icon: typeof TreePine;
  title: string;
  body: string;
};

const PILLARS: Pillar[] = [
  {
    Icon: TreePine,
    title: "Hidden in Nature",
    body: "Nestled within lush riverside gardens, Mtoni offers a peaceful retreat where birdsong, ancient trees, and open skies shape every moment.",
  },
  {
    Icon: Plane,
    title: "Perfect Before & After Safari",
    body: "Only minutes from Kilimanjaro International Airport and within easy reach of Arusha's renowned national parks, Mtoni is an ideal beginning or ending to your northern Tanzania adventure.",
  },
  {
    Icon: Flame,
    title: "Crafted for Slow Living",
    body: "Whether you're unwinding beside the pool, sharing stories around the evening fire, or enjoying locally inspired cuisine, every experience encourages you to slow down and reconnect.",
  },
];

export function WhyMtoni() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="why-mtoni-heading"
      className="relative bg-ivory px-6 py-28 lg:px-12 lg:py-40"
    >
      <div className="mx-auto max-w-[1200px]">
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
          className="mx-auto mb-20 max-w-3xl text-center lg:mb-28"
        >
          <p className="eyebrow">Why Mtoni</p>
          <h2
            id="why-mtoni-heading"
            className="mt-4 font-display text-5xl leading-[1.04] lg:text-6xl"
          >
            More Than a Place to Stay
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-charcoal/70 lg:text-lg">
            Every memorable stay begins with a sense of place. At Mtoni River Lodge, nature,
            thoughtful hospitality, and an exceptional location come together to create experiences
            that stay with you long after your journey ends.
          </p>
        </motion.div>

        <ul className="grid gap-12 md:grid-cols-3 lg:gap-0">
          {PILLARS.map(({ Icon, title, body }, i) => (
            <motion.li
              key={title}
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                duration: 0.85,
                delay: i * 0.18,
                ease: [0.22, 0.61, 0.36, 1],
              }}
              className="group relative flex flex-col items-center text-center lg:px-12"
            >
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full border border-charcoal/10 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:border-charcoal/30 group-hover:shadow-soft">
                <Icon
                  className="h-7 w-7 text-charcoal/70 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:text-charcoal"
                  strokeWidth={1.2}
                  aria-hidden
                />
              </div>
              <h3 className="font-display text-2xl lg:text-3xl">{title}</h3>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-charcoal/65 lg:text-base">
                {body}
              </p>
              {i < PILLARS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute right-0 top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-charcoal/15 to-transparent lg:block"
                />
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
