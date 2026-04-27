import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import { Button } from "@/components/ui/button";
import { WHATSAPP_NOTE } from "@/lib/contact";
import cycling from "@/assets/xp-cycling.jpg";
import riverWalk from "@/assets/xp-river-walk.jpg";
import motorbike from "@/assets/xp-motorbike.jpg";
import cooking from "@/assets/xp-cooking.jpg";
import bonfire from "@/assets/xp-bonfire.jpg";
import market from "@/assets/xp-market.jpg";
import canoe from "@/assets/xp-canoe.jpg";

const xp = [
  { num: "01", eyebrow: "On two wheels", title: "Cycling", img: cycling, body: "Explore the quiet surroundings of Mtoni on two wheels, moving through open landscapes and local paths at your own pace." },
  { num: "02", eyebrow: "On foot", title: "Guided River Walks", img: riverWalk, body: "Walk alongside the river with a local guide, discovering the subtle rhythms of the ecosystem and the stories carried by the land." },
  { num: "03", eyebrow: "Off the path", title: "Motorbike Off-road Adventure", img: motorbike, body: "Venture beyond the lodge on an off-road motorbike experience, navigating rugged terrain and expansive natural routes." },
  { num: "04", eyebrow: "At the table", title: "Live Cooking Experience", img: cooking, body: "Gather around the kitchen and experience meals prepared in real time, where local ingredients and shared moments come together." },
  { num: "05", eyebrow: "After dark", title: "Bonfire Experience", img: bonfire, body: "As evening settles, gather around the fire beneath open skies — a space for warmth, reflection, and quiet connection." },
  { num: "06", eyebrow: "In the village", title: "Local Market Experience", img: market, body: "Visit nearby markets and engage with local culture through craft, food, and everyday life in the surrounding community." },
  { num: "07", eyebrow: "On still water", title: "Lake Duluti Canoeing", img: canoe, body: "Glide across the calm waters of Lake Duluti, surrounded by forest and stillness, offering a peaceful contrast to the river’s flow." },
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
            <p className="eyebrow">The Experiences</p>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-8 max-w-xl font-display text-2xl leading-relaxed text-charcoal/80 lg:text-3xl">
              A collection of quiet, considered ways to spend the day — each rooted in the landscape that surrounds the lodge.
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
                  <p className="font-mono text-xs tracking-[0.32em] text-charcoal/40">
                    {e.num}
                  </p>
                  <p className="eyebrow mt-4">{e.eyebrow}</p>
                  <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
                    {e.title}
                  </h2>
                  <span className="mt-6 inline-block h-px w-12 bg-charcoal/30" />
                  <p className="mt-6 max-w-md text-base leading-relaxed text-charcoal/70">
                    {e.body}
                  </p>
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
