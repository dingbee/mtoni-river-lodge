import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { WHATSAPP_NOTE } from "@/lib/contact";
import heroImg from "@/assets/hero-river.jpg";
import suiteImg from "@/assets/suite-interior.jpg";
import diningImg from "@/assets/dining.jpg";
import aerialImg from "@/assets/aerial-lodge.jpg";
import guideImg from "@/assets/guide.jpg";
import villaImg from "@/assets/villa-exterior.jpg";
import poolImg from "@/assets/pool.jpg";
import coffeeImg from "@/assets/coffee.jpg";
import spaImg from "@/assets/spa.jpg";
import xpRiverWalk from "@/assets/xp-river-walk.jpg";
import xpCycling from "@/assets/xp-cycling.jpg";
import xpBonfire from "@/assets/xp-bonfire.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mtoni River Lodge — Riverfront Sanctuary in Arusha, Tanzania" },
      { name: "description", content: "An intimate luxury eco-lodge on the banks of the Mtoni River. Twelve riverfront suites, fireside dining, and curated journeys into the heart of Tanzania." },
      { property: "og:image", content: heroImg },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      {/* HERO */}
      <section className="relative h-[100svh] w-full overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="Mist over the Mtoni River at dawn with Mount Meru in the distance" className="ken-burns h-full w-full object-cover" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 via-charcoal/10 to-charcoal/80" />
        </div>

        <div className="relative z-10 mx-auto flex h-full max-w-[1500px] flex-col justify-end px-6 pb-24 text-ivory lg:px-12 lg:pb-32">
          <Reveal>
            <p className="eyebrow !text-ivory/70">Arusha · Tanzania</p>
          </Reveal>
          <Reveal delay={150}>
            <h1 className="mt-6 max-w-5xl font-display text-[3.25rem] leading-[1.02] tracking-tight sm:text-6xl lg:text-[6.5rem]">
              A river. A whisper.<br/>
              <em className="font-light italic text-ivory/85">A homecoming.</em>
            </h1>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-12 flex flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-md text-pretty text-ivory/80">
               A serene retreat where Africa’s beauty meets authenticity. On the banks of the Mtoni River, we blend traditional Maasai architecture and modern comforts, offering a uniquely African stay.
              </p>
              <div className="flex flex-col items-start gap-3 sm:items-end">
                <Link
                  to="/plan"
                  hash="booking-form"
                  className="group inline-flex items-center gap-4 border border-ivory px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.32em] transition-colors hover:bg-ivory hover:text-charcoal"
                >
                  Check Availability
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <p className="max-w-xs text-left text-[0.72rem] leading-relaxed text-ivory/65 sm:text-right">
                  {WHATSAPP_NOTE}
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-ivory/70">
          <div className="flex flex-col items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em]">
            <span className="h-12 w-px animate-pulse bg-ivory/50" />
          </div>
        </div>
      </section>

      {/* INTRO / NARRATIVE */}
      <section className="relative px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto grid max-w-[1300px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">Chapter One</p>
            <h2 className="mt-6 font-display text-5xl leading-[1.04] lg:text-6xl">
              The river<br/>writes the day.
            </h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="font-display text-2xl leading-[1.45] text-charcoal/80 lg:text-[1.7rem]">
              At first light, a soft veil of mist lifts from the water, and the lodge wakes quietly with it. Paths wind between stone and earth, leading to twenty-four suites set low along the riverbank — each shaped in the spirit of a Maasai boma, where circular forms, natural textures, and open space create a sense of grounding and ease.
            </p>
            <p className="mt-8 max-w-lg text-base leading-relaxed text-charcoal/70">
              Here, architecture does not compete with the landscape; it follows it. Walls carry the warmth of earth, timber frames the light, and every threshold opens toward the rhythm of the river. The day unfolds without urgency — mornings in stillness, afternoons in shade, evenings gathered under the sky as lanterns glow and the sound of water carries through the night.
            </p>
            <div className="mt-12 grid grid-cols-3 gap-8 border-t border-border pt-8">
              {[["24","MAASAI BOMA SUITES"],["48","Acres of Forest"],["1","Winding River"]].map(([n,l])=>(
                <div key={l}>
                  <p className="font-display text-4xl">{n}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* AERIAL FULL-BLEED */}
      <section className="relative h-[80svh] w-full overflow-hidden">
        <img src={aerialImg} alt="Aerial view of Mtoni River Lodge nestled in the riverbend" className="h-full w-full object-cover" loading="lazy" width={1920} height={1080} />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-16 text-ivory lg:px-12 lg:pb-24">
          <Reveal>
            <p className="eyebrow !text-ivory/70">A place, found</p>
            <h2 className="mt-4 max-w-3xl font-display text-4xl leading-tight lg:text-6xl">
              Where the river leads, and everything else follows.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* SUITES TEASER — editorial split */}
      <section className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mb-20 flex flex-col items-end justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="eyebrow">The Suites</p>
              <h2 className="mt-4 font-display text-5xl leading-[1.04] lg:text-7xl">
              Living spaces.<br/>
              Rooted in nature.
              </h2>
            </div>
            <Link to="/suites" className="group inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]">
              Discover the suites
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </Reveal>

          <div className="grid gap-12 lg:grid-cols-12">
            <Reveal className="lg:col-span-7">
              <div className="relative aspect-[4/5] overflow-hidden lg:aspect-[5/6]">
                <img src={suiteImg} alt="Interior of a Mtoni River Lodge suite at dusk" className="h-full w-full object-cover" loading="lazy" />
              </div>
            </Reveal>
            <Reveal delay={200} className="self-end lg:col-span-4 lg:col-start-9">
              <p className="eyebrow">No. 01</p>
              <h3 className="mt-3 font-display text-3xl lg:text-4xl">Riverfront Deluxe</h3>
              <p className="mt-6 leading-relaxed text-charcoal/70">Set along the river’s edge at Mtoni River Lodge, the Riverfront Deluxe Suite offers a calm, immersive escape with uninterrupted water views.</p>
              <ul className="mt-8 space-y-3 text-sm text-charcoal/80">
                {["Private river-facing deck","Antique king bed","Outdoor copper shower","Indoor bathtub"].map((f)=>(
                  <li key={f} className="flex items-baseline gap-3">
                    <span className="h-px w-6 bg-charcoal/40" />{f}
                  </li>
                ))}
              </ul>
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
            <Link to="/experiences" className="inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]">
              All experiences →
            </Link>
          </div>
        </div>
      </section>

      {/* DINING — full bleed quote */}
      <section className="relative h-[90svh] w-full overflow-hidden">
        <img src={diningImg} alt="Outdoor riverside dining at twilight" className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-charcoal/40" />
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
              <img src={poolImg} alt="Infinity pool overlooking the river" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <p className="eyebrow mt-8">Stillness</p>
            <h3 className="mt-3 font-display text-3xl lg:text-4xl">A pool in conversation with nature</h3>
            <p className="mt-4 max-w-md text-charcoal/70">
              At the heart of Mtoni lies a round pool, shaped in quiet dialogue with nature.
            </p>
          </Reveal>
          <Reveal delay={200} className="lg:mt-32">
            <div className="aspect-[4/5] overflow-hidden">
              <img src={spaImg} alt="Riverside spa pavilion" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <p className="eyebrow mt-8">Ritual</p>
            <h3 className="mt-3 font-display text-3xl lg:text-4xl">Spa beneath the thatch</h3>
            <p className="mt-4 max-w-md text-charcoal/70">
              Treatments drawn from East African botanicals — wild ginger, rosehip, baobab — performed to the sound of running water.
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
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { date: "March 2026", title: "What the river taught us about time", read: "6 min" },
              { date: "February 2026", title: "A morning with the beekeepers of Gomba", read: "4 min" },
              { date: "January 2026", title: "Reading the sky over Mount Meru", read: "5 min" },
            ].map((p, i) => (
              <Reveal key={p.title} delay={i*120}>
                <article className="group">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{p.date} · {p.read}</p>
                  <h3 className="mt-4 font-display text-2xl leading-snug transition-colors group-hover:text-ember">{p.title}</h3>
                  <span className="mt-6 inline-block border-b border-charcoal/40 pb-1 text-[0.7rem] uppercase tracking-[0.28em]">Read</span>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="relative bg-charcoal px-6 py-32 text-ivory lg:px-12 lg:py-48">
        <div className="mx-auto max-w-[1100px] text-center">
          <Reveal>
            <p className="eyebrow !text-ivory/60">Begin the journey</p>
            <h2 className="mt-8 font-display text-5xl leading-[1.05] lg:text-7xl">
              The river is waiting.<br/>
              <em className="italic text-ivory/85">When will you arrive?</em>
            </h2>
            <div className="mt-12 flex flex-col items-center gap-4">
              <Link
                to="/plan"
                hash="booking-form"
                className="inline-flex items-center gap-4 border border-ivory px-8 py-5 text-[0.72rem] uppercase tracking-[0.32em] hover:bg-ivory hover:text-charcoal"
              >
                Reserve Your Stay →
              </Link>
              <p className="max-w-md text-center text-xs leading-relaxed text-ivory/65">
                {WHATSAPP_NOTE}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
