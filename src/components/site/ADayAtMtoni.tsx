import { motion, useReducedMotion } from "framer-motion";
import { Sun, Leaf, Waves, Sunset, Flame } from "lucide-react";

type Moment = {
  Icon: typeof Sun;
  time: string;
  title: string;
  body: string;
};

const MOMENTS: Moment[] = [
  { Icon: Sun, time: "Sunrise", title: "First light", body: "Fresh Tanzanian coffee and birdsong." },
  { Icon: Leaf, time: "Morning", title: "Wander", body: "Garden paths, river walks and quiet moments." },
  { Icon: Waves, time: "Afternoon", title: "Ease", body: "Poolside relaxation and locally inspired cuisine." },
  { Icon: Sunset, time: "Sunset", title: "Golden hour", body: "Golden reflections across the river." },
  { Icon: Flame, time: "Evening", title: "Gather", body: "Stories around the fire beneath African skies." },
];

export function ADayAtMtoni() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="a-day-at-mtoni-heading"
      className="relative bg-ivory px-6 py-28 lg:px-12 lg:py-40"
    >
      <div className="mx-auto max-w-[900px]">
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
          className="text-center"
        >
          <p className="eyebrow">The Rhythm of the Day</p>
          <h2
            id="a-day-at-mtoni-heading"
            className="mt-4 font-display text-5xl leading-[1.04] lg:text-7xl"
          >
            A Day at Mtoni
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-charcoal/70 lg:text-lg">
            From first light to firelight — an unhurried arc of small, memorable hours.
          </p>
        </motion.div>

        <ol className="mt-20 flex flex-col items-center gap-14 lg:mt-28 lg:gap-20">
          {MOMENTS.map(({ Icon, time, title, body }, i) => (
            <motion.li
              key={time}
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{
                duration: 0.85,
                delay: i * 0.08,
                ease: [0.22, 0.61, 0.36, 1],
              }}
              className="flex w-full max-w-xl flex-col items-center text-center"
            >
              <Icon
                className="h-7 w-7 text-primary"
                strokeWidth={1.3}
                aria-hidden
              />
              <p className="mt-5 text-[0.68rem] uppercase tracking-[0.36em] text-charcoal/55">
                {time}
              </p>
              <h3 className="mt-3 font-display text-2xl leading-tight lg:text-4xl">
                {title}
              </h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-charcoal/70 lg:text-lg">
                {body}
              </p>

              {i < MOMENTS.length - 1 && (
                <span
                  aria-hidden
                  className="mt-12 block h-14 w-px bg-gradient-to-b from-charcoal/25 to-transparent lg:mt-16 lg:h-20"
                />
              )}
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}