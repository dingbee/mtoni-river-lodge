import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import aerial from "@/assets/aerial-lodge.jpg";
import villa from "@/assets/villa-exterior.jpg";
import detail from "@/assets/detail-coffee.jpg";

export const Route = createFileRoute("/lodge")({
  head: () => ({
    meta: [
      { title: "The Lodge — Mtoni River Lodge" },
      { name: "description", content: "A small, family-run riverfront sanctuary built quietly into the banks of the Mtoni River, Arusha." },
      { property: "og:image", content: aerial },
    ],
  }),
  component: LodgePage,
});

function LodgePage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <section className="relative h-[80svh] overflow-hidden">
        <img src={villa} alt="Mtoni River Lodge villa at twilight" className="ken-burns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 to-charcoal/70" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-24 text-ivory lg:px-12">
          <Reveal><p className="eyebrow !text-ivory/70">The Lodge</p></Reveal>
          <Reveal delay={150}><h1 className="mt-6 max-w-3xl font-display text-5xl leading-[1.05] lg:text-7xl">A sanctuary built quietly into the riverbank.</h1></Reveal>
        </div>
      </section>

      <section className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto grid max-w-[1300px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">Our story</p>
            <h2 className="mt-6 font-display text-5xl leading-tight">A family. A river.{"\n"}A long conversation.</h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="font-display text-2xl leading-relaxed text-charcoal/80">
              Nestled along the pristine banks of the Mtoni River, our lodge is more than just a retreat; it’s a vision brought to life.
            </p>
            <p className="mt-6 leading-relaxed text-charcoal/70">
              Every stone, every beam, every linen was chosen with intention. The lodge was designed by Tanzanian architects to disappear into the trees, leaving only the sound of the water and the warmth of lantern-light.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="grid lg:grid-cols-2">
        <Reveal>
          <div className="aspect-square overflow-hidden lg:aspect-auto lg:h-full">
            <img src={detail} alt="Morning coffee detail" className="h-full w-full object-cover" loading="lazy" />
          </div>
        </Reveal>
        <div className="flex items-center bg-bone px-8 py-24 lg:px-20">
          <Reveal>
            <p className="eyebrow">Philosophy</p>
            <h2 className="mt-4 font-display text-4xl lg:text-5xl">Less, but better.</h2>
            <div className="mt-10 space-y-8 text-charcoal/75">
              {[
                ["Land first","Built around — not on top of — the trees, the river, and the wildlife corridor it shares."],
                ["Local hands","98% of our team is Tanzanian. Our chef trained in Arusha. Our weavers are from Gomba."],
                ["Slow craft","No televisions. No clocks. The day is set by the light and the river."],
              ].map(([t,d])=>(
                <div key={t}>
                  <p className="font-display text-xl">{t}</p>
                  <p className="mt-2 text-sm leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto grid max-w-[1300px] gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {[["48","Acres of forest"],["12","Riverfront suites"],["1.2km","Of private river"],["100%","Solar by 2026"]].map(([n,l])=>(
            <Reveal key={l}>
              <div className="border-t border-border pt-6">
                <p className="font-display text-5xl">{n}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">{l}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
