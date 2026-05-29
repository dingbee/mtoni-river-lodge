import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import { Button } from "@/components/ui/button";
import { WHATSAPP_NOTE } from "@/lib/contact";
import cycling from "@/assets/xp-cycling.jpg";
import riverWalk from "@/assets/xp-river-walk.jpg";
import cooking from "@/assets/xp-cooking.jpg";
import canoe from "@/assets/xp-canoe.jpg";
import market from "@/assets/xp-market.jpg";
import waterfall from "@/assets/xp-waterfall.jpg";
import hotsprings from "@/assets/xp-hotsprings.jpg";

type Xp = {
  eyebrow: string;
  title: string;
  img: string;
  body: string;
  price: string;
  priceNote?: string;
  transport?: string;
};

const xp: Xp[] = [
  {
    eyebrow: "On still water",
    title: "Lake Duluti Canoeing",
    img: canoe,
    body: "Glide across the calm waters of Lake Duluti surrounded by forest stillness and birdlife.",
    price: "$35",
    priceNote: "per person",
    transport: "+ $25 transport",
  },
  {
    eyebrow: "In the village",
    title: "Local Market Experience",
    img: market,
    body: "Walk through vibrant local markets and discover the rhythms, colors, and textures of everyday life in Arusha.",
    price: "$35",
    priceNote: "per person",
  },
  {
    eyebrow: "On two wheels",
    title: "Mountain Bike Adventure",
    img: cycling,
    body: "Explore nearby trails and open landscapes on a guided cycling experience through the countryside.",
    price: "$25",
    priceNote: "per person",
  },
  {
    eyebrow: "Through hidden paths",
    title: "Waterfall Excursion",
    img: waterfall,
    body: "A refreshing journey through nature paths leading to hidden waterfalls and cool natural pools.",
    price: "$25",
    priceNote: "per person",
    transport: "+ $20 transport",
  },
  {
    eyebrow: "Restorative waters",
    title: "Maji Moto Hot Springs",
    img: hotsprings,
    body: "A restorative day experience at the natural hot springs, surrounded by open landscapes and crystal-clear waters.",
    price: "$250",
    priceNote: "for up to 4 guests",
  },
  {
    eyebrow: "On foot",
    title: "Guided River Walks",
    img: riverWalk,
    body: "Slow walks along the riverbank through greenery, birdsong, and flowing streams.",
    price: "Complimentary",
    priceNote: "for lodge guests",
  },
  {
    eyebrow: "At the table",
    title: "Live Cooking Experience",
    img: cooking,
    body: "Prepare and enjoy local dishes through an interactive cooking experience inspired by regional traditions.",
    price: "$35",
    priceNote: "per person",
  },
];

export const Route = createFileRoute("/experiences")({
  head: () => ({
    meta: [
      { title: "Experiences — Mtoni River Lodge" },
      { name: "description", content: "Authentic experiences at Mtoni River Lodge — cycling, guided river walks, off-road adventures, live cooking, bonfires, local markets and canoeing on Lake Duluti." },
      { property: "og:image", content: riverWalk },
    ],
  }),
  component: ExperiencesPage,
});

function ExperiencesPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <PageHero
        image={riverWalk}
        imageAlt="Guided river walk at sunrise along the Mtoni River"
        eyebrow="Experiences"
        title={<>Rooted in nature,<br/>guided by the land.</>}
      />

      <section className="px-6 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="eyebrow">Mtoni Experiences</p>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-8 max-w-xl font-display text-2xl leading-relaxed text-charcoal/80 lg:text-3xl">
              Slow encounters shaped by river, land, and local tradition.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto flex max-w-[1300px] flex-col gap-24 lg:gap-40">
          {xp.map((e, i) => {
            const reverse = i % 2 === 1;
            return (
              <article
                key={e.title}
                className="grid items-center gap-10 md:grid-cols-12 md:gap-16"
              >
                <Reveal className={`md:col-span-7 ${reverse ? "md:order-2" : ""}`}>
                  <div className="aspect-[4/5] overflow-hidden md:aspect-[5/6]">
                    <img
                      src={e.img}
                      alt={e.title}
                      width={1280}
                      height={1600}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[1800ms] ease-out hover:scale-105"
                    />
                  </div>
                </Reveal>

                <Reveal
                  delay={150}
                  className={`md:col-span-5 ${reverse ? "md:order-1 md:pr-6" : "md:pl-6"}`}
                >
                  <p className="eyebrow">{e.eyebrow}</p>
                  <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
                    {e.title}
                  </h2>
                  <span className="mt-6 inline-block h-px w-12 bg-charcoal/30" />
                  <p className="mt-6 max-w-md text-base leading-relaxed text-charcoal/70">
                    {e.body}
                  </p>
                  <div className="mt-8 max-w-md">
                    <p className="text-[10px] uppercase tracking-[0.32em] text-charcoal/40">From</p>
                    <p className="mt-2 font-display text-xl leading-snug text-charcoal/80 lg:text-2xl">
                      {e.price}
                      {e.priceNote && (
                        <span className="ml-2 text-sm font-sans tracking-wide text-charcoal/55">
                          {e.priceNote}
                        </span>
                      )}
                    </p>
                    {e.transport && (
                      <p className="mt-1 text-xs italic tracking-wide text-charcoal/45">
                        {e.transport}
                      </p>
                    )}
                  </div>
                </Reveal>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-charcoal/10 px-6 py-32 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="eyebrow">Stay with us</p>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-8 font-display text-4xl leading-tight lg:text-5xl">
              Plan your stay and experience Mtoni.
            </h2>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-12">
              <Button asChild size="lg" className="rounded-none px-10 py-6 text-xs uppercase tracking-[0.3em]">
                <Link to="/book">
                  Check Availability
                </Link>
              </Button>
              <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-charcoal/55">
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
