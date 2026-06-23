import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Leaf, Waves } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { LocationMap } from "@/components/site/LocationMap";
import { HeroCinematic } from "@/components/site/HeroCinematic";
import { GuestExperiencesSection } from "@/components/site/reviews/GuestExperiencesSection";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import { RESERVATIONS_NOTE } from "@/lib/contact";
import { trackCheckAvailabilityClick, trackContactClick } from "@/lib/analytics";
import { getLatestJournalPosts } from "@/lib/journal";
import heroImg from "@/assets/hero-river.jpg";
import lodgeHeroImg from "@/assets/lodge-hero-aerial.jpg";
import cottageHeroImg from "@/assets/hero-cottage-exterior.jpg";
import receptionHeroImg from "@/assets/hero-reception-interior.jpg";
import heroImg800 from "@/assets/hero-river-800w.webp";
import heroImg1600 from "@/assets/hero-river-1600w.webp";
import cottageHero800 from "@/assets/hero-cottage-exterior-800w.webp";
import cottageHero1600 from "@/assets/hero-cottage-exterior-1600w.webp";
import receptionHero800 from "@/assets/hero-reception-interior-800w.webp";
import receptionHero1600 from "@/assets/hero-reception-interior-1600w.webp";
import suiteImg from "@/assets/suite-interior.jpg";
import diningImg from "@/assets/dining.jpg";
import aerialImg from "@/assets/aerial-lodge.jpg";
import guideImg from "@/assets/guide.jpg";
import villaImg from "@/assets/villa-exterior.jpg";
import poolImg from "@/assets/pool.jpg";
import coffeeImg from "@/assets/coffee.jpg";
import spaImg from "@/assets/spa.jpg";
import ritualImg from "@/assets/rituals.jpg";
import xpRiverWalk from "@/assets/xp-river-walk.jpg";
import xpCycling from "@/assets/xp-cycling.jpg";
import xpBonfire from "@/assets/xp-bonfire.jpg";

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
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mtoni River Lodge — Riverfront Sanctuary in Arusha, Tanzania" },
       { name: "description", content: "An intimate luxury eco-lodge on the banks of the Nduruma River. 24 riverfront rooms in Arusha, Tanzania, fireside dining, and curated journeys into the heart of the country." },
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
    ],
    scripts: [buildFAQJsonLd(HOME_FAQS)],
  }),
  component: HomePage,
});

function HomePage() {
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
            src: cottageHeroImg,
            webp800: cottageHero800,
            webp1600: cottageHero1600,
            alt: "A thatched riverfront cottage at Mtoni River Lodge nestled among forest greenery",
          },
          {
            src: receptionHeroImg,
            webp800: receptionHero800,
            webp1600: receptionHero1600,
            alt: "Warm stone reception interior at Mtoni River Lodge with arched doorways and a beaded chandelier",
          },
        ]}
        slideDurationMs={7000}
      />

      {/* INTRO / NARRATIVE */}
      <section className="relative px-6 pb-32 pt-12 lg:px-12 lg:pb-48 lg:pt-28">
        <div className="mx-auto grid max-w-[1300px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <h2 className="mt-6 font-display text-5xl leading-[1.04] lg:text-6xl">
              The river<br/>writes the day.
            </h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="font-display text-2xl leading-[1.45] text-charcoal/80 lg:text-[1.7rem]">
              At first light, a soft veil of mist lifts from the water, and the lodge wakes quietly with it. Paths wind between stone and earth, leading to twenty-four rooms set low along the riverbank — each shaped in the spirit of a Maasai boma, where circular forms, natural textures, and open space create a sense of grounding and ease.
            </p>
            <p className="mt-8 max-w-lg text-base leading-relaxed text-charcoal/70">
              Here, architecture does not compete with the landscape; it follows it. Walls carry the warmth of earth, timber frames the light, and every threshold opens toward the rhythm of the river. The day unfolds without urgency — mornings in stillness, afternoons in shade, evenings gathered under the sky as lanterns glow and the sound of water carries through the night.
            </p>
            <div className="mt-12 grid grid-cols-3 gap-8 border-t border-border pt-8 text-center">
              {[
                { Icon: Home, label: "Maasai Boma Rooms" },
                { Icon: Leaf, label: "Eco Lodge" },
                { Icon: Waves, label: "Riverfront Setting" },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center">
                  <Icon className="h-9 w-9 text-primary" strokeWidth={1.4} aria-hidden />
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* AERIAL FULL-BLEED */}
      <section className="relative h-[80svh] w-full overflow-hidden">
        <img src={aerialImg} alt="Candlelit dining hall at Mtoni River Lodge with cowhide chairs and lantern light" className="h-full w-full object-cover" loading="lazy" width={1920} height={1080} />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/25 to-charcoal/35" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-16 text-ivory lg:px-12 lg:pb-24">
          <Reveal>
            <p className="eyebrow !text-ivory/70">A place, found</p>
            <h2 className="hero-text-shadow mt-4 max-w-3xl font-display text-4xl leading-tight text-ivory lg:text-6xl">
              Where the river leads, and everything else follows.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* ROOMS TEASER — editorial split */}
      <section className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mb-20 flex flex-col items-end justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="eyebrow">Rooms by the River</p>
              <h2 className="mt-4 font-display text-5xl leading-[1.04] lg:text-7xl">
              Living spaces.<br/>
              Rooted in nature.
              </h2>
            </div>
            <Link to="/rooms" className="group inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]">
              Explore Rooms
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </Reveal>

          <div className="grid gap-12 lg:grid-cols-12">
            <Reveal className="lg:col-span-7">
              <div className="relative aspect-[4/5] overflow-hidden lg:aspect-[5/6]">
                <img src={suiteImg} alt="Candlelit bubble bath with champagne beneath the thatched roof of a Mtoni River Lodge suite" className="h-full w-full object-cover" loading="lazy" />
              </div>
            </Reveal>
            <Reveal delay={200} className="self-end lg:col-span-4 lg:col-start-9">
              <h3 className="mt-3 font-display text-3xl lg:text-4xl">Riverfront Deluxe</h3>
              <p className="mt-6 leading-relaxed text-charcoal/70">Set along the river’s edge at Mtoni River Lodge, the Riverfront Deluxe Room offers a calm, immersive escape with uninterrupted water views — an earth-and-thatch sanctuary inspired by Maasai boma design.</p>
              <ul className="mt-8 space-y-3 text-sm text-charcoal/80">
                {["Private river-facing deck","Antique king bed","Outdoor copper shower","Indoor bathtub"].map((f)=>(
                  <li key={f} className="flex items-baseline gap-3">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-charcoal/70" />{f}
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  to="/book"
                  onClick={() => trackCheckAvailabilityClick("homepage_rooms_teaser")}
                  className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-7 py-3.5 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
                >
                  View Availability
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  to="/rooms"
                  className="inline-flex items-center gap-2 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]"
                >
                  Explore Rooms →
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* EXPERIENCES — editorial grid */}
      <section className="bg-bone px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mb-20 max-w-3xl">
            <p className="eyebrow">Days at Mtoni</p>
            <h2 className="mt-4 font-display text-5xl leading-[1.04] lg:text-7xl">
              Slow mornings.<br/>Wild afternoons.
            </h2>
            <p className="mt-8 max-w-lg text-charcoal/70">
              Days unfold at the pace of the river — guided walks at first light, cycling and off-road rides through open country, canoeing on Lake Duluti, and evenings drawn together by live cooking, local markets, and firelight under the sky.
            </p>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-12">
            {[
              { img: xpRiverWalk, eyebrow: "On foot", title: "Guided river walks", note: "At first light" },
              { img: xpCycling, eyebrow: "On two wheels", title: "Cycling the foothills", note: "Open country · Local paths" },
              { img: xpBonfire, eyebrow: "After dark", title: "Bonfire under the sky", note: "By firelight · Evenings" },
            ].map((e, i) => (
              <Reveal key={e.title} delay={i*150} className={i===1 ? "md:col-span-4 md:mt-24" : "md:col-span-4"}>
                <Link to="/experiences" className="group block">
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <img src={e.img} alt={e.title} className="h-full w-full object-cover transition-transform duration-[1500ms] group-hover:scale-105" loading="lazy" />
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="eyebrow">{e.eyebrow}</p>
                      <h3 className="mt-2 font-display text-2xl">{e.title}</h3>
                    </div>
                    <span className="text-xs italic text-muted-foreground">{e.note}</span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-16 text-center">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/plan"
                className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-7 py-3.5 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
              >
                Plan Your Stay
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
          </div>
        </div>
      </section>

      {/* DINING — full bleed quote */}
      <section className="relative h-[90svh] w-full overflow-hidden">
        <img src={diningImg} alt="Stone lobby entrance with beaded chandelier and arched doorways at Mtoni River Lodge" className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-charcoal/30" />
        <div className="relative z-10 mx-auto flex h-full max-w-[1100px] flex-col items-center justify-center px-6 text-center text-ivory">
          <Reveal>
            <p className="eyebrow !text-ivory/60">Dining</p>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-8 font-display text-3xl italic leading-[1.3] lg:text-5xl">
              "Dinner is set wherever the light is most beautiful — on the deck, in the orchard, beside the water."
            </p>
          </Reveal>
          <Reveal delay={300}>
            <p className="mt-10 text-ivory/70">— Chef Amina Mwakikoti</p>
            <Link to="/dining" className="mt-12 inline-flex items-center gap-3 border border-ivory px-7 py-4 text-[0.72rem] uppercase tracking-[0.32em] hover:bg-ivory hover:text-charcoal">
              The kitchen
            </Link>
          </Reveal>
        </div>
      </section>

      {/* TWO-COLUMN: pool + spa story */}
      <section className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto grid max-w-[1400px] gap-16 lg:grid-cols-2">
          <Reveal>
            <div className="aspect-[4/5] overflow-hidden">
              <img src={poolImg} alt="Curved swimming pool framed by thatched umbrellas and tropical greenery at Mtoni River Lodge" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <p className="eyebrow mt-8">Stillness</p>
            <h3 className="mt-3 font-display text-3xl lg:text-4xl">A pool in conversation with nature</h3>
            <p className="mt-4 max-w-md text-charcoal/70">
              At the heart of Mtoni lies a round pool, shaped in quiet dialogue with nature.
            </p>
          </Reveal>
          <Reveal delay={200} className="lg:mt-32">
            <div className="relative aspect-[4/5] overflow-hidden group">
              <img
                src={ritualImg}
                alt="Hand lighting a candle by firelight — an evening ritual at the lodge"
                className="h-full w-full object-cover object-center transition-transform duration-[2000ms] ease-out group-hover:scale-[1.04] motion-safe:animate-[kenBurns_24s_ease-in-out_infinite_alternate]"
                loading="lazy"
              />
              {/* Warm earthy tint */}
              <div className="pointer-events-none absolute inset-0 bg-[#7a3a12]/10 mix-blend-multiply" />
              {/* Subtle vignette for cinematic depth */}
              <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.35)_100%)]" />
            </div>
            <p className="eyebrow mt-8">Ritual</p>
            <h3 className="mt-3 font-display text-3xl lg:text-4xl">​Where light becomes a ritual.</h3>
            <p className="mt-4 max-w-md text-charcoal/70">
              As daylight fades along the river, candlelight is gently introduced to mark the shift into stillness, turning ordinary evening moments into quiet rituals of presence and connection.
            </p>
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
            <Link to="/journal" className="hidden text-[0.72rem] uppercase tracking-[0.28em] underline-offset-8 hover:underline sm:inline">All stories →</Link>
          </Reveal>
          {(() => {
            const [featured, ...secondary] = getLatestJournalPosts(4);
            if (!featured) return null;
            return (
              <>
                <Reveal>
                  <Link
                    to={featured.href}
                    className="group grid gap-10 lg:grid-cols-12 lg:gap-16"
                  >
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
              The river is waiting.<br/>
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
