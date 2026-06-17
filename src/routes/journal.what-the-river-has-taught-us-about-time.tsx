import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { WHATSAPP_URL } from "@/lib/contact";
import river from "@/assets/nduruma-river-flow.jpg";

const TITLE = "What the River Has Taught Us About Time";
const DESCRIPTION =
  "On the slow art of arriving, and why we removed every clock from the lodge.";

export const Route = createFileRoute(
  "/journal/what-the-river-has-taught-us-about-time",
)({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: river },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: river },
    ],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />

      <article>
        <div className="px-6 pt-32 lg:px-12 lg:pt-40">
          <div className="mx-auto max-w-3xl">
            <Link
              to="/journal"
              className="inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal/60 transition-colors hover:text-charcoal"
            >
              ← Back to Journal
            </Link>
          </div>
        </div>
        <header className="px-6 pt-10 pb-16 lg:px-12 lg:pt-14">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <p className="eyebrow">March 2026 · 6 min read</p>
            </Reveal>
            <Reveal delay={200}>
              <h1 className="mt-6 font-display text-4xl leading-[1.05] lg:text-6xl">
                {TITLE}
              </h1>
            </Reveal>
            <Reveal delay={320}>
              <p className="mt-8 text-lg leading-[1.7] text-charcoal/70">
                {DESCRIPTION}
              </p>
            </Reveal>
          </div>
        </header>

        <Reveal>
          <figure className="px-6 lg:px-12">
            <div className="mx-auto aspect-[16/9] max-w-[1300px] overflow-hidden">
              <img
                src={river}
                alt="The Nduruma River in full flow, framed by lush green banks under a dramatic sky"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="mx-auto mt-4 max-w-3xl text-xs uppercase tracking-[0.22em] text-muted-foreground">
              The Nduruma in full flow — photograph by the lodge
            </figcaption>
          </figure>
        </Reveal>

        <section className="px-6 py-24 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-3xl space-y-8 font-serif text-lg leading-[1.85] text-charcoal/85">
            <Reveal>
              <p>
                The first thing the river does, when you arrive, is ignore
                you. It does not pause. It does not adjust its rhythm to
                meet yours. It moves the way it has always moved — south,
                slow, certain — and asks, gently, whether you can match it.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <p>
                Most guests cannot, at first. They arrive carrying a week of
                meetings in their shoulders, the residue of airports in
                their voices. They check their phones for the time, and
                find that there are no clocks at the lodge — not in the
                rooms, not in the dining pavilion, not above the small
                wooden desk at reception. We removed them, one by one, in
                the second year. The river, we decided, was already keeping
                time. We did not need to argue with it.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
                The slow art of arriving
              </h2>
              <p>
                Arrival, we have come to believe, is not a moment but a
                practice. It happens in stages: the long drive in, the
                first cup of ginger tea on the deck, the slow recognition
                that the sound you keep mistaking for traffic is, in fact,
                wind in the fig trees. By the second morning, most guests
                stop asking what time breakfast is served. They simply
                appear when they are hungry. The kitchen, which has been
                quietly waiting, begins.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <p>
                The river teaches this without lecturing. It rises a little
                in the rains. It falls in the dry months. The fish eagles
                arrive at four, almost to the minute, but no one writes it
                down. The hippos surface at dusk. The stars, when they
                come, are not in any hurry to be admired.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
                What we kept, what we let go
              </h2>
              <p>
                We kept the bells — one in the kitchen, one by the boat
                landing — because bells are not clocks. They mark a
                moment, then release it. We kept the long table, where
                breakfast unfolds for as long as it needs to. We kept the
                lanterns, which are lit by hand each evening by someone
                who has lit them, in the same order, for nine years.
              </p>
              <p>
                We let go of the schedule on the wall. We let go of the
                printed itinerary in each room. We let go, eventually, of
                the polite fiction that a holiday is something to be
                optimised. What remained was simpler, and harder, and
                much more honest: a place, a river, and the time it takes
                to notice them.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <p className="pt-6 italic text-charcoal/70">
                Come slowly. Stay a while. The river is in no rush, and
                neither, for these few days, are you.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="border-t border-border px-6 py-20 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <p className="eyebrow">Related Reading</p>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="mt-4 font-display text-3xl leading-tight lg:text-4xl">
                Continue exploring Mtoni
              </h2>
            </Reveal>
            <Reveal delay={220}>
              <ul className="mt-10 divide-y divide-border border-y border-border">
                {[
                  { to: "/", label: "Mtoni River Lodge — Riverfront Sanctuary in Arusha", description: "Return to the homepage to glimpse the wider landscape." },
                  { to: "/lodge", label: "About Mtoni River Lodge", description: "Our story, our family, and the philosophy that shaped this place." },
                  { to: "/experiences", label: "Slow Experiences by the River", description: "Walks, fireside dinners, and gentle journeys that follow the river's pace." },
                  { to: "/journal/a-morning-with-the-beekeepers-of-gomba", label: "Life Along the Nduruma River", description: "The farming traditions that share this water with the lodge." },
                  { to: "/journal/the-architecture-of-disappearing", label: "Maasai Boma Architecture", description: "How the rooms were built to disappear into the riverbank." },
                ].map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="group flex flex-col gap-2 py-6 transition-colors hover:text-[var(--gold)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                    >
                      <span className="font-display text-xl leading-snug sm:text-2xl">
                        {link.label}
                      </span>
                      <span className="text-sm leading-relaxed text-charcoal/65 sm:max-w-sm sm:text-right">
                        {link.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="border-t border-border px-6 py-24 lg:px-12">
          <div className="mx-auto flex max-w-3xl flex-col items-start gap-6">
            <Reveal>
              <p className="eyebrow">Plan your stay</p>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="font-display text-3xl leading-tight lg:text-4xl">
                Find a few quiet days by the river.
              </h2>
            </Reveal>
            <Reveal delay={240}>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-3 bg-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-charcoal/85"
              >
                Check Availability →
              </a>
            </Reveal>
          </div>
        </section>
      </article>

      <SiteFooter />
    </div>
  );
}