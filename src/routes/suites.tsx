import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import suiteImg from "@/assets/suite-interior.jpg";
import villa from "@/assets/villa-exterior.jpg";
import pool from "@/assets/pool.jpg";

const suites = [
  { no: "01", name: "River Suite", size: "62 m²", view: "River-facing private deck", img: suiteImg, desc: "The signature suite — a four-poster bed, copper soaking tub, and a deck that floats above the water." },
  { no: "02", name: "Forest Pavilion", size: "78 m²", view: "Canopy-level perch", img: villa, desc: "Tucked into the treeline with floor-to-ceiling glass, a private plunge pool, and an outdoor shower beneath the leaves." },
  { no: "03", name: "Mtoni House", size: "140 m²", view: "Two bedrooms · river bend", img: pool, desc: "Our private two-bedroom residence with a dedicated cook, butler, and a stretch of riverbank entirely your own." },
];

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
          <Reveal delay={150}><h1 className="mt-6 font-display text-5xl leading-tight lg:text-7xl">Living spaces. Rooted in nature.</h1></Reveal>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1400px] space-y-32 lg:space-y-48">
          {suites.map((s, i) => (
            <Reveal key={s.no}>
              <div className={`grid items-center gap-12 lg:grid-cols-12 ${i%2 ? "lg:[direction:rtl]" : ""}`}>
                <div className="lg:col-span-7 lg:[direction:ltr]">
                  <div className="aspect-[4/3] overflow-hidden">
                    <img src={s.img} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                </div>
                <div className="lg:col-span-4 lg:[direction:ltr]">
                  <p className="eyebrow">No. {s.no}</p>
                  <h2 className="mt-3 font-display text-4xl lg:text-5xl">{s.name}</h2>
                  <div className="mt-6 flex gap-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <span>{s.size}</span><span>·</span><span>{s.view}</span>
                  </div>
                  <p className="mt-6 leading-relaxed text-charcoal/75">{s.desc}</p>
                  <Link to="/plan" className="mt-8 inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]">Enquire about this suite →</Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
