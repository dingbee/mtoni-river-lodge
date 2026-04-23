import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { WHATSAPP_NOTE } from "@/lib/contact";
import { SUITES, type Suite } from "@/lib/suites";
import suiteImg from "@/assets/suite-interior.jpg";

export const Route = createFileRoute("/suites")({
  head: () => ({
    meta: [
      { title: "Suites — Mtoni River Lodge" },
      { name: "description", content: "Twelve riverfront suites at Mtoni River Lodge — hand-finished in dark hardwood, ivory linen, and East African textiles." },
      { property: "og:image", content: suiteImg },
    ],
  }),
  component: SuitesPage,
});

function SuitesPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <section className="relative h-[70svh] overflow-hidden">
        <img src={suiteImg} alt="Suite interior" className="ken-burns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 to-charcoal/60" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-20 text-ivory lg:px-12">
          <Reveal><p className="eyebrow !text-ivory/70">Suites</p></Reveal>
          <Reveal delay={150}><h1 className="mt-6 font-display text-5xl leading-tight lg:text-7xl">Suites at Mtoni<br/>River Lodge.</h1></Reveal>
          <Reveal delay={300}>
            <p className="mt-6 max-w-xl text-ivory/80">
              Three quiet sanctuaries along the Nduruma River — each shaped by stone, timber, and the rhythm of the water.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1400px] space-y-32 lg:space-y-48">
          {SUITES.map((s, i) => (
            <SuiteRow key={s.no} suite={s} reverse={i % 2 === 1} />
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function SuiteRow({ suite: s, reverse }: { suite: Suite; reverse: boolean }) {
  return (
    <Reveal>
      <div id={s.slug} className={`scroll-mt-24 grid items-center gap-12 lg:grid-cols-12 ${reverse ? "lg:[direction:rtl]" : ""}`}>
        <div className="lg:col-span-7 lg:[direction:ltr]">
          <Link to="/suites/$slug" params={{ slug: s.slug }} className="block aspect-[4/3] overflow-hidden group">
            <img src={s.img} alt={s.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
          </Link>
        </div>
        <div className="lg:col-span-4 lg:[direction:ltr]">
          <p className="eyebrow">No. {s.no}</p>
          <h2 className="mt-3 font-display text-4xl lg:text-5xl">{s.name}</h2>
          <div className="mt-6 flex gap-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>{s.size}</span><span>·</span><span>{s.view}</span>
          </div>
          <p className="mt-6 leading-relaxed text-charcoal/75">{s.shortDesc}</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link
              to="/suites/$slug"
              params={{ slug: s.slug }}
              className="group inline-flex items-center gap-3 border border-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
            >
              <span>Explore Suite</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/plan"
              hash="booking-form"
              className="inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]"
            >
              Check Availability →
            </Link>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-charcoal/55">
            {WHATSAPP_NOTE}
          </p>
        </div>
      </div>
    </Reveal>
  );
}
