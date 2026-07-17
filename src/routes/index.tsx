import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { LocationMap } from "@/components/site/LocationMap";
import { HeroCinematic } from "@/components/site/HeroCinematic";
import { ExperiencesCinematic } from "@/components/site/ExperiencesCinematic";
import { RiverWritesADay } from "@/components/site/RiverWritesADay";
import { WhyMtoni } from "@/components/site/WhyMtoni";
import { GuestExperiencesSection } from "@/components/site/reviews/GuestExperiencesSection";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import { RESERVATIONS_NOTE } from "@/lib/contact";
import { trackCheckAvailabilityClick, trackContactClick } from "@/lib/analytics";
import { usePublicCms } from "@/lib/use-public-cms";
import { CmsBody, hasCmsBody } from "@/components/site/CmsBody";
import { useQuery } from "@tanstack/react-query";
import { listPublishedJournalArticles } from "@/domains/content/journal/journal-public.functions";
import { mergeJournalPosts, type DbJournalRow } from "@/lib/journal-merged";
import { ROOMS, getRoomPath } from "@/lib/rooms";
import heroImg from "@/assets/hero-river.jpg";
import heroImg800 from "@/assets/hero-river-800w.webp";
import heroImg1600 from "@/assets/hero-river-1600w.webp";
import forestLightJpg from "@/assets/forest-light.jpg.asset.json";
import forestLight800 from "@/assets/forest-light-800w.webp.asset.json";
import forestLight1600 from "@/assets/forest-light-1600w.webp.asset.json";
import palmGardenJpg from "@/assets/palm-garden.jpg.asset.json";
import palmGarden800 from "@/assets/palm-garden-800w.webp.asset.json";
import palmGarden1600 from "@/assets/palm-garden-1600w.webp.asset.json";
import diningCandleJpg from "@/assets/hero-dining-candlelit.jpg.asset.json";
import diningCandle800 from "@/assets/hero-dining-candlelit-800w.webp.asset.json";
import diningCandle1600 from "@/assets/hero-dining-candlelit-1600w.webp.asset.json";
import diningImg from "@/assets/dining.jpg";

const HOME_FAQS: FAQItem[] = [
  {
    q: "Where is Mtoni River Lodge located?",
    a: "Mtoni River Lodge sits on the banks of the Nduruma River in Arusha, Tanzania — a quiet riverside retreat between Kilimanjaro International Airport and Arusha town, well placed for Northern Tanzania safaris.",
  },
  {
    q: "How many rooms does the lodge have?",
    a: "We have 24 riverfront rooms across three styles — Riverfront Standard, Riverfront Deluxe, and our Family & Garden Suite — each inspired by Maasai boma design and built from natural materials.",
  },
  {
    q: "Is breakfast included with a stay?",
    a: "Yes. Every booking includes a full breakfast served riverside, alongside personal hosting from our team throughout your stay.",
  },
  {
    q: "Can the lodge arrange airport transfers and safaris?",
    a: "Yes. Our reservations team arranges transfers from Kilimanjaro International Airport and Arusha Airport, and can plan day trips and multi-day safaris to Arusha National Park, Tarangire, Lake Manyara, Ngorongoro, and the Serengeti.",
  },
  {
    q: "How do I check availability and book?",
    a: "Use the Check Availability page to see live rates and confirm a stay online, or contact our reservations team directly for tailored arrangements.",
  },
  {
    q: "Do you accommodate Mount Kilimanjaro climbers?",
    a: "Yes — Mtoni River Lodge is a popular pre-climb base and post-summit recovery stay for trekkers. We arrange early breakfasts, gear storage, and private transfers to and from the Kilimanjaro trailheads. See our Kilimanjaro stays page for details.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mtoni River Lodge — Riverfront Sanctuary in Arusha, Tanzania" },
      {
        name: "description",
        content:
          "An intimate luxury eco-lodge on the banks of the Nduruma River. 24 riverfront rooms in Arusha, Tanzania, fireside dining, and curated journeys into the heart of the country.",
      },
      { property: "og:image", content: heroImg },
    ],
    links: [
      // Preload the LCP hero image; the browser picks the matching variant
      // via the imagesrcset + media query, so mobile fetches ~35 KB instead
      // of the full-res JPG.
      {
        rel: "preload",
        as: "image",
        href: heroImg800,
        type: "image/webp",
        imagesrcset: `${heroImg800} 800w, ${heroImg1600} 1600w`,
        imagesizes: "100vw",
        fetchpriority: "high",
      },
      { rel: "canonical", href: "https://mtoniriverlodge.com/" },
    ],
    scripts: [buildFAQJsonLd(HOME_FAQS)],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: cms } = usePublicCms("homepage");
  const { data: dbJournalRows } = useQuery<DbJournalRow[]>({
    queryKey: ["journal.public.list"],
    queryFn: () => listPublishedJournalArticles(),
    staleTime: 60_000,
  });
  const latestJournal = mergeJournalPosts(dbJournalRows).slice(0, 4);

  if (hasCmsBody(cms)) return <CmsBody blocks={cms.blocks} overlayHeader />;

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      <HeroCinematic
        poster={heroImg}
        posterAlt="Mist over the Nduruma River at dawn with Mount Meru in the distance"
        posters={[
          {
            src: heroImg,
            webp800: heroImg800,
            webp1600: heroImg1600,
            alt: "Mist over the Nduruma River at dawn with Mount Meru in the distance",
          },
          {
            src: forestLightJpg.url,
            webp800: forestLight800.url,
            webp1600: forestLight1600.url,
            alt: "Morning light filtering through the forest canopy at Mtoni River Lodge",
          },
          {
            src: diningCandleJpg.url,
            webp800: diningCandle800.url,
            webp1600: diningCandle1600.url,
            alt: "Candlelit dining table with gourd pendant lamps and stone wall at Mtoni River Lodge",
          },
        ]}
        slideDurationMs={7000}
      />

      {/* EDITORIAL TRUST — Why Mtoni */}
      <WhyMtoni />

      {/* CINEMATIC EDITORIAL — Where the River Writes a Day */}
      <RiverWritesADay
        img={palmGardenJpg.url}
        img800={palmGarden800.url}
        img1600={palmGarden1600.url}
        alt="Stone pathway winding through tall palms in the tropical garden at Mtoni River Lodge"
      />

      {/* EXPERIENCES — full-bleed cinematic carousel */}
      <section
        aria-labelledby="experiences-heading"
        className="bg-bone px-6 pt-24 lg:px-12 lg:pt-32"
      >
        <div className="mx-auto mb-14 max-w-[1400px] lg:mb-20">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Days at Mtoni</p>
            <h2
              id="experiences-heading"
              className="mt-4 font-display text-5xl leading-[1.04] lg:text-7xl"
            >
              Slow mornings.
              <br />
              Wild afternoons.
            </h2>
            <p className="mt-6 max-w-lg text-charcoal/70">A few moments from a day by the river.</p>
          </Reveal>
        </div>
      </section>
      <ExperiencesCinematic />
      <section className="bg-bone px-6 py-16 text-center lg:px-12 lg:py-20">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/experiences"
            className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-7 py-3.5 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
          >
            All Experiences
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <Link
            to="/contact"
            onClick={() => trackContactClick("contact", "homepage_experiences")}
            className="inline-flex items-center gap-2 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]"
          >
            Talk To Our Team →
          </Link>
        </div>
      </section>

      {/* ACCOMMODATION PREVIEW — curated room categories */}
      <section aria-labelledby="accommodation-heading" className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
            <p className="eyebrow">Stay Within Nature</p>
            <h2
              id="accommodation-heading"
              className="mt-4 font-display text-5xl leading-[1.04] lg:text-7xl"
            >
              Choose Your Retreat
            </h2>
            <p className="mt-8 text-base leading-relaxed text-charcoal/70 lg:text-lg">
              Whether you’re seeking uninterrupted river views, a peaceful garden retreat, or space
              for family and friends, every stay at Mtoni River Lodge is thoughtfully designed to
              immerse you in nature, comfort, and authentic hospitality.
            </p>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {ROOMS.map((room, i) => (
              <Reveal key={room.slug} delay={i * 120}>
                <Link to={getRoomPath(room.slug)} className="group block h-full">
                  <div className="aspect-[4/5] overflow-hidden bg-bone">
                    <img
                      src={room.img}
                      alt={`${room.name} at Mtoni River Lodge`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out motion-safe:md:group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="pt-6">
                    <h3 className="font-display text-2xl lg:text-3xl">{room.name}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-charcoal/70">
                      {room.shortDesc}
                    </p>
                    <span className="mt-6 inline-flex items-center gap-2 border-b border-charcoal pb-1 text-[0.7rem] uppercase tracking-[0.28em] transition-colors group-hover:text-charcoal/70">
                      Explore Room
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-16 flex justify-center lg:mt-20">
            <Link
              to="/rooms"
              className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
            >
              Explore All Rooms
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* DINING — full bleed quote */}
      <section className="relative h-[90svh] w-full overflow-hidden">
        <img
          src={diningImg}
          alt="Stone lobby entrance with beaded chandelier and arched doorways at Mtoni River Lodge"
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-charcoal/30" />
        <div className="relative z-10 mx-auto flex h-full max-w-[1100px] flex-col items-center justify-center px-6 text-center text-ivory">
          <Reveal>
            <p className="eyebrow !text-ivory/60">Dining</p>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-8 font-display text-3xl italic leading-[1.3] lg:text-5xl">
              "Dinner is set wherever the light is most beautiful — on the deck, in the orchard,
              beside the water."
            </p>
          </Reveal>
          <Reveal delay={300}>
            <p className="mt-10 text-ivory/70">— Chef Amina Mwakikoti</p>
            <Link
              to="/dining"
              className="mt-12 inline-flex items-center gap-3 border border-ivory px-7 py-4 text-[0.72rem] uppercase tracking-[0.32em] hover:bg-ivory hover:text-charcoal"
            >
              The kitchen
            </Link>
          </Reveal>
        </div>
      </section>

      {/* KILIMANJARO RETREAT — climber positioning */}
      <section className="bg-bone px-6 py-32 lg:px-12 lg:py-40">
        <div className="mx-auto grid max-w-[1300px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">Your Kilimanjaro Retreat in Arusha</p>
            <h2 className="mt-6 font-display text-4xl leading-[1.05] lg:text-6xl">
              Before the climb,
              <br />
              and after the summit.
            </h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="text-lg leading-relaxed text-charcoal/80">
              A 50-minute drive from Kilimanjaro International Airport, Mtoni River Lodge is a
              quiet, low-altitude base for trekkers preparing for Mount Kilimanjaro — and a
              restorative landing place for those returning from the summit. Expect deep sleep by
              the river, hot showers, nourishing meals, and transfers coordinated with your climbing
              operator.
            </p>
            <ul className="mt-8 grid gap-3 text-sm text-charcoal/75 sm:grid-cols-2">
              {[
                "Pre-climb rest by the river",
                "Post-summit recovery comfort",
                "Early or packed breakfasts",
                "Private transfers to the gate",
              ].map((b) => (
                <li key={b} className="flex items-baseline gap-3">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-charcoal/70" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/book"
                onClick={() => trackCheckAvailabilityClick("homepage_kilimanjaro_block")}
                className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-7 py-3.5 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
              >
                Book Your Stay
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                to="/contact"
                onClick={() => trackContactClick("contact", "homepage_kilimanjaro_block")}
                className="inline-flex items-center gap-2 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]"
              >
                Contact Us →
              </Link>
              <Link
                to="/mount-kilimanjaro-accommodation-arusha"
                className="inline-flex items-center gap-2 border-b border-charcoal/40 pb-1 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal/70 hover:border-charcoal hover:text-charcoal"
              >
                Climber stays →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* JOURNAL TEASER */}
      <section className="border-t border-border bg-bone px-6 py-32 lg:px-12">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mb-16 flex items-end justify-between">
            <div>
              <p className="eyebrow">From the Journal</p>
              <h2 className="mt-4 font-display text-4xl lg:text-6xl">Stories from the riverbank</h2>
            </div>
            <Link
              to="/journal"
              className="hidden text-[0.72rem] uppercase tracking-[0.28em] underline-offset-8 hover:underline sm:inline"
            >
              All stories →
            </Link>
          </Reveal>
          {(() => {
            const [featured, ...secondary] = getLatestJournalPosts(4);
            if (!featured) return null;
            return (
              <>
                <Reveal>
                  <Link to={featured.href} className="group grid gap-10 lg:grid-cols-12 lg:gap-16">
                    <div className="relative overflow-hidden lg:col-span-7">
                      <img
                        src={featured.img}
                        alt={featured.title}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[4/3] w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03] lg:aspect-[16/11]"
                      />
                      <span className="absolute left-5 top-5 bg-ivory/95 px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.28em] text-charcoal">
                        Featured Story
                      </span>
                    </div>
                    <div className="flex flex-col justify-center lg:col-span-5">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {featured.date} · {featured.read}
                      </p>
                      <h3 className="mt-5 font-display text-3xl leading-[1.1] transition-colors group-hover:text-ember lg:text-5xl">
                        {featured.title}
                      </h3>
                      <p className="mt-6 text-base leading-relaxed text-charcoal/70 lg:text-lg">
                        {featured.excerpt}
                      </p>
                      <span className="mt-8 inline-block self-start border-b border-charcoal/40 pb-1 text-[0.72rem] uppercase tracking-[0.28em] transition-colors group-hover:border-charcoal">
                        Read More →
                      </span>
                    </div>
                  </Link>
                </Reveal>
                {secondary.length > 0 && (
                  <div className="mt-20 grid gap-12 border-t border-charcoal/10 pt-16 md:grid-cols-3">
                    {secondary.map((p, i) => (
                      <Reveal key={p.title} delay={i * 120}>
                        <Link to={p.href} className="group flex h-full flex-col">
                          <div className="mb-6 overflow-hidden">
                            <img
                              src={p.img}
                              alt={p.title}
                              loading="lazy"
                              decoding="async"
                              className="aspect-[4/3] w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
                            />
                          </div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {p.date} · {p.read}
                          </p>
                          <h3 className="mt-4 font-display text-xl leading-snug transition-colors group-hover:text-ember">
                            {p.title}
                          </h3>
                          <p className="mt-3 line-clamp-3 text-[0.95rem] leading-relaxed text-charcoal/65">
                            {p.excerpt}
                          </p>
                          <span className="mt-5 inline-block self-start border-b border-charcoal/40 pb-1 text-[0.7rem] uppercase tracking-[0.28em] transition-colors group-hover:border-charcoal">
                            Read Article →
                          </span>
                        </Link>
                      </Reveal>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </section>

      {/* GUEST EXPERIENCES — featured reviews grouped by category */}
      <GuestExperiencesSection />

      <section className="relative bg-charcoal px-6 py-32 text-ivory lg:px-12 lg:py-48">
        <div className="mx-auto max-w-[1100px] text-center">
          <Reveal>
            <p className="eyebrow !text-ivory/60">Begin the journey</p>
            <h2 className="mt-8 font-display text-5xl leading-[1.05] lg:text-7xl">
              The river is waiting.
              <br />
              <em className="italic text-ivory/85">When will you arrive?</em>
            </h2>
            <div className="mt-12 flex flex-col items-center gap-5">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/book"
                  onClick={() => trackCheckAvailabilityClick("homepage_final_cta")}
                  className="inline-flex items-center gap-4 border border-ivory bg-ivory px-8 py-5 text-[0.72rem] uppercase tracking-[0.32em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
                >
                  Check Availability →
                </Link>
                <Link
                  to="/contact"
                  onClick={() => trackContactClick("contact", "homepage_final_cta")}
                  className="inline-flex items-center gap-3 border border-ivory/60 px-8 py-5 text-[0.72rem] uppercase tracking-[0.32em] text-ivory hover:bg-ivory hover:text-charcoal"
                >
                  Contact Reservations →
                </Link>
              </div>
              <p className="max-w-md text-center text-xs leading-relaxed text-ivory/65">
                {RESERVATIONS_NOTE}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <LocationMap />

      <FAQ
        faqs={HOME_FAQS}
        eyebrow="Good to know"
        heading="Frequently asked questions"
        intro="A few things guests often ask before arriving at the river."
      />

      <SiteFooter />
    </div>
  );
}
