import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import guide from "@/assets/guide.jpg";
import coffee from "@/assets/coffee.jpg";
import spa from "@/assets/spa.jpg";
import villa from "@/assets/villa-exterior.jpg";
import pool from "@/assets/pool.jpg";
import dining from "@/assets/dining.jpg";

const xp = [
  { eyebrow:"Walking", title:"Maasai bush walk", duration:"3 hours · sunrise", img:guide, body:"Walk the riverbank with a Maasai guide, reading tracks, learning the medicinal plants, and arriving back to coffee on the deck." },
  { eyebrow:"Tasting", title:"Arabica plantation visit", duration:"Half day", img:coffee, body:"Visit a family-run estate beneath Mount Meru. Pick, roast, and cup the harvest of the season." },
  { eyebrow:"Ritual", title:"Riverside spa", duration:"60–120 min", img:spa, body:"Bodywork drawn from East African botanicals: wild ginger, baobab, rosehip — performed beneath the thatch." },
  { eyebrow:"After dark", title:"Lantern-lit dinner", duration:"Evening", img:dining, body:"A long table, set wherever the light is loveliest. A four-course menu shaped by what arrived from the garden that morning." },
  { eyebrow:"Wildlife", title:"Arusha National Park", duration:"Full day", img:villa, body:"Game drives through the slopes of Mount Meru — buffalo, giraffe, colobus, and the soda flamingos of Momela." },
  { eyebrow:"Stillness", title:"Riverside reading hours", duration:"Anytime", img:pool, body:"A book, a hammock, a pot of fresh ginger tea, and the river. Possibly the most underrated experience here." },
];

export const Route = createFileRoute("/experiences")({
  head: () => ({
    meta: [
      { title: "Experiences — Mtoni River Lodge" },
      { name: "description", content: "Curated experiences in the foothills of Mount Meru — Maasai walks, coffee plantations, riverside spa, and lantern-lit dinners." },
      { property: "og:image", content: guide },
    ],
  }),
  component: ExperiencesPage,
});

function ExperiencesPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <section className="relative h-[70svh] overflow-hidden">
        <img src={guide} alt="Maasai guide at sunrise" className="ken-burns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-charcoal/40" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-20 text-ivory lg:px-12">
          <Reveal><p className="eyebrow !text-ivory/70">Experiences</p></Reveal>
          <Reveal delay={150}><h1 className="mt-6 font-display text-5xl leading-tight lg:text-7xl">Days shaped by the land,<br/>led by those who know it.</h1></Reveal>
        </div>
      </section>

      <section className="px-6 py-32 lg:px-12 lg:py-40">
        <div className="mx-auto grid max-w-[1400px] gap-x-10 gap-y-24 md:grid-cols-2">
          {xp.map((e, i)=>(
            <Reveal key={e.title} delay={(i%2)*150} className={i%2 ? "md:mt-24" : ""}>
              <div className="aspect-[4/5] overflow-hidden">
                <img src={e.img} alt={e.title} className="h-full w-full object-cover transition-transform duration-[1500ms] hover:scale-105" loading="lazy" />
              </div>
              <div className="mt-6 flex items-baseline justify-between">
                <p className="eyebrow">{e.eyebrow}</p>
                <span className="text-xs italic text-muted-foreground">{e.duration}</span>
              </div>
              <h2 className="mt-2 font-display text-3xl">{e.title}</h2>
              <p className="mt-3 max-w-md leading-relaxed text-charcoal/70">{e.body}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
