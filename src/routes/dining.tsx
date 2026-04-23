import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import dining from "@/assets/dining.jpg";
import detail from "@/assets/detail-coffee.jpg";

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "Dining — Mtoni River Lodge" },
      { name: "description", content: "A daily-changing menu shaped by the garden, the river, and the season. Long tables set wherever the light is most beautiful." },
      { property: "og:image", content: dining },
    ],
  }),
  component: DiningPage,
});

function DiningPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <section className="relative h-[80svh] overflow-hidden">
        <img src={dining} alt="Riverside dining at twilight" className="ken-burns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-charcoal/45" />
        <div className="absolute inset-0 mx-auto flex max-w-[1100px] flex-col items-center justify-center px-6 text-center text-ivory">
          <Reveal><p className="eyebrow !text-ivory/70">Dining</p></Reveal>
          <Reveal delay={150}><h1 className="mt-6 font-display text-5xl leading-[1.05] lg:text-7xl">A table set to the rhythm of the river.</h1></Reveal>
        </div>
      </section>

      <section className="px-6 py-32 lg:px-12 lg:py-48">
        <div className="mx-auto grid max-w-[1300px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">The kitchen</p>
            <h2 className="mt-6 font-display text-5xl leading-tight">Garden, river,<br/>fire.</h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="font-display text-2xl leading-relaxed text-charcoal/80">
              Our kitchen is led by Chef Amina Mwakikoti, who returned home to Arusha after years in the kitchens of Cape Town and Lisbon. The menu changes every day, dictated by what the garden, the orchard, and the river offer.
            </p>
            <p className="mt-8 leading-relaxed text-charcoal/70">
              Breakfasts are quiet — fresh fruit, just-baked bread, ginger coffee. Lunch is served by the pool. Dinner is the evening's small ceremony: four courses, lantern light, and a long table beneath the trees.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="grid lg:grid-cols-2">
        <Reveal>
          <div className="aspect-square overflow-hidden lg:aspect-auto lg:h-full">
            <img src={detail} alt="Morning coffee at Mtoni" className="h-full w-full object-cover" loading="lazy" />
          </div>
        </Reveal>
        <div className="flex items-center bg-bone px-8 py-24 lg:px-20">
          <Reveal>
            <p className="eyebrow">A sample evening menu</p>
            <ol className="mt-10 space-y-10">
              {[
                ["Amuse","Smoked tilapia, river herbs, lime"],
                ["First","Heirloom tomato, baobab oil, basil seed"],
                ["Main","Slow lamb shoulder, Arusha coffee jus, charred millet"],
                ["Dessert","Honey custard, cardamom, wild figs"],
              ].map(([course,dish],i)=>(
                <li key={course} className="flex items-baseline gap-6 border-t border-border/60 pt-6">
                  <span className="font-display text-3xl text-ember">{String(i+1).padStart(2,"0")}</span>
                  <div>
                    <p className="eyebrow">{course}</p>
                    <p className="mt-2 font-display text-xl">{dish}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
