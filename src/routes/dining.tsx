import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import dining from "@/assets/dining-hero.jpg";
import liveCooking from "@/assets/live-cooking.jpg";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";
import { WHATSAPP_URL } from "@/lib/contact";
import { Link } from "@tanstack/react-router";
import { trackCheckAvailabilityClick } from "@/lib/analytics";
import { trackContactClick } from "@/lib/analytics";

export const Route = createFileRoute("/dining")({
  head: () => ({
    meta: [
      { title: "Dining by the River — Mtoni River Lodge" },
      { name: "description", content: "Live cooking over open fire, river-fed gardens, and a menu shaped by what grows here. An immersive farm-to-table experience in Arusha." },
      { property: "og:image", content: dining },
    ],
    scripts: [
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Dining", path: "/dining" },
      ]),
    ],
  }),
  component: DiningPage,
});

function DiningPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      <PageHero
        image={dining}
        imageAlt="Garden picnic with live open-fire cooking at Mtoni River Lodge"
        eyebrow="Dining"
        title="Dining by the River"
        subtitle="At Mtoni River Lodge, dining is not a separate experience — it is part of the landscape. Meals shaped by river-fed gardens, lodge groves, and the slow craft of open-fire cooking."
        align="center"
        imagePosition="center 35%"
      />

      {/* CORE EXPERIENCE — open kitchen */}
      <section className="px-6 pb-28 lg:px-12 lg:pb-40">
        <div className="mx-auto grid max-w-[1300px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">The open kitchen</p>
            <h2 className="mt-6 font-display text-5xl leading-tight">Where fire,<br/>flavor, and<br/>storytelling<br/>meet.</h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="font-display text-2xl leading-relaxed text-charcoal/80">
              The heart of Mtoni dining is live cooking over open fire and traditional preparation methods. Guests are invited to witness food being prepared in real time — slow cooking, grilling, and plating that reflects Tanzanian culinary heritage and seasonal availability.
            </p>
            <p className="mt-8 leading-relaxed text-charcoal/70">
              This is not restaurant service in the conventional sense. It is an open, living kitchen — not hidden behind a kitchen door, but shared in the open air, where cooking becomes part of the experience.
            </p>
          </Reveal>
        </div>
      </section>

      {/* LOCAL FOOD PHILOSOPHY */}
      <section className="bg-bone px-6 py-28 lg:px-12 lg:py-36">
        <div className="mx-auto max-w-[1100px]">
          <Reveal>
            <p className="eyebrow">Local food philosophy</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-6xl">
              What grows here,<br/>is what is served here.
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-10 max-w-2xl leading-relaxed text-charcoal/70">
              Menus change with the seasons and are shaped by the river-fed ecosystems of Arusha — a quiet conversation between the garden, the market, and the fire.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Garden", "Fresh vegetables grown in the lodge gardens"],
              ["Groves", "Bananas and tropical fruits from the riverbanks"],
              ["Markets", "Local spices and ingredients from Arusha"],
              ["Tradition", "Tanzanian cooking methods passed down generations"],
            ].map(([label, body], i) => (
              <Reveal key={label} delay={100 + i * 80}>
                <div className="border-t border-border/60 pt-6">
                  <p className="eyebrow">{label}</p>
                  <p className="mt-4 font-display text-xl leading-snug text-charcoal/85">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* LIVE COOKING + ATMOSPHERE */}
      <section className="grid lg:grid-cols-2">
        <Reveal>
          <div className="relative aspect-square overflow-hidden lg:aspect-auto lg:h-full group">
            <img
              src={liveCooking}
              alt="Chef plating an open-fire dish at Mtoni River Lodge"
              className="h-full w-full object-cover object-center transition-transform duration-[2000ms] ease-out group-hover:scale-[1.04] motion-safe:animate-[kenBurns_24s_ease-in-out_infinite_alternate]"
              loading="lazy"
            />
            {/* Warm earthy tint to match brand palette */}
            <div className="pointer-events-none absolute inset-0 bg-[#7a3a12]/10 mix-blend-multiply" />
            {/* Subtle vignette for cinematic depth */}
            <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.3)_100%)]" />
          </div>
        </Reveal>
        <div className="flex items-center bg-charcoal px-8 py-24 text-ivory lg:px-20">
          <Reveal>
            <p className="eyebrow !text-ivory/60">The live cooking experience</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">
              Cooking, shared in the open air.
            </h2>
            <ul className="mt-10 space-y-6">
              {[
                "Open-fire grilling and roasting",
                "Traditional pot cooking methods",
                "Seasonal preparation rituals",
                "Chef-led storytelling around food origins",
              ].map((item) => (
                <li key={item} className="flex items-baseline gap-5 border-t border-ivory/15 pt-5">
                  <span className="h-1.5 w-1.5 rounded-full bg-ember" />
                  <p className="font-display text-xl text-ivory/90">{item}</p>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-sm leading-relaxed text-ivory/65">
              Set within river-stone architecture and earth-toned materials, surrounded by greenery nourished by the Nduruma River — a setting designed for presence, not rush.
            </p>
          </Reveal>
        </div>
      </section>

      {/* SAMPLE EVENING MENU — narrative */}
      <section className="px-6 py-28 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1100px]">
          <Reveal>
            <p className="eyebrow">A sample evening menu</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-6xl">
              Evenings unfold slowly —<br/>guided by fire and river.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-10 max-w-2xl leading-relaxed text-charcoal/70">
              This is not a fixed menu, but a reflection of what the land offers each day. Ingredients are drawn from river-fed gardens, nearby farms, and local markets, then prepared in the open through live cooking traditions. Each dish is simple, intentional, and deeply rooted in place.
            </p>
          </Reveal>

          <div className="mt-20 space-y-16">
            {[
              {
                eyebrow: "Starters",
                glyph: "🌿",
                items: [
                  "Roasted pumpkin soup finished with coconut and local herbs",
                  "Charred seasonal vegetables with river salt and lime",
                  "Fresh avocado and tomato salad with garden greens",
                ],
              },
              {
                eyebrow: "Main course — live cooking",
                glyph: "🔥",
                items: [
                  "Open-fire grilled free-range chicken with local spice marinade",
                  "Slow-cooked beef stew prepared in traditional pots",
                  "Charcoal-roasted plantains with herb butter",
                  "Steamed rice or ugali served with seasonal vegetable sides",
                ],
              },
              {
                eyebrow: "Side experience",
                glyph: "🍌",
                items: [
                  "Fresh banana dishes inspired by traditional Tanzanian recipes",
                  "Light sautéed greens from lodge gardens",
                ],
              },
              {
                eyebrow: "Dessert",
                glyph: "🍯",
                items: [
                  "Caramelized bananas with honey and toasted coconut",
                  "Fresh tropical fruits of the season",
                  "Light tea-infused dessert using local flavors",
                ],
              },
              {
                eyebrow: "Beverages",
                glyph: "☕",
                items: [
                  "Freshly brewed Tanzanian coffee",
                  "Herbal teas infused with local leaves",
                  "Light evening refreshments",
                ],
              },
            ].map((course, i) => (
              <Reveal key={course.eyebrow} delay={i * 60}>
                <div className="grid gap-6 border-t border-border/60 pt-8 lg:grid-cols-12">
                  <div className="lg:col-span-4">
                    <span className="font-display text-3xl text-ember" aria-hidden>{course.glyph}</span>
                    <p className="eyebrow mt-3">{course.eyebrow}</p>
                  </div>
                  <ul className="space-y-4 lg:col-span-8">
                    {course.items.map((dish) => (
                      <li key={dish} className="font-display text-xl leading-relaxed text-charcoal/85">
                        {dish}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <p className="mt-20 max-w-2xl text-sm italic leading-relaxed text-charcoal/60">
              Meals are prepared in the open, where guests can observe the process — from fire to plate. Dining is set under soft evening light, with the sound of the river in the background and a bonfire nearby. Menus change daily depending on seasonal availability and local sourcing.
            </p>
          </Reveal>
        </div>
      </section>

      {/* FUEL FOR ADVENTURE */}
      <section className="border-t border-border bg-ivory px-6 py-28 lg:px-12 lg:py-36">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">Fuel for Adventure</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">
              Food that travels well<br/>with how you move.
            </h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-7">
            <p className="text-lg leading-relaxed text-charcoal/80">
              Our kitchen is shaped to support the way our guests actually spend their days — long, slow, and often outdoors. Meals are fresh, generous, and nourishing, suitable for the very different bodies that arrive at the river.
            </p>
            <ul className="mt-8 grid gap-4 text-sm text-charcoal/75 sm:grid-cols-2">
              {[
                ["Safari guests", "Hearty early breakfasts and packed lunches before game drives."],
                ["Mount Kilimanjaro climbers", "Carb-rich pre-climb dinners and recovery meals after summit."],
                ["Wellness travellers", "Lighter, plant-forward plates and herbal infusions from the garden."],
                ["Long-stay guests", "A rotating, seasonal kitchen that never feels repetitive."],
              ].map(([label, body]) => (
                <li key={label as string} className="border-t border-charcoal/15 pt-4">
                  <p className="eyebrow">{label}</p>
                  <p className="mt-2 leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm leading-relaxed text-charcoal/65">
              Early breakfasts and packed meals can be arranged at check-in. Just let our team know your plan for the day.
            </p>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-bone px-6 py-28 text-center lg:py-36">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <p className="eyebrow">Reserve</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">
              An evening of live cooking and river-inspired dining.
            </h2>
            <p className="mt-8 leading-relaxed text-charcoal/70">
              Secure your preferred room in minutes — our team can arrange a private table or special menu on request.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/book"
                onClick={() => trackCheckAvailabilityClick("dining_page")}
                className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-7 py-3.5 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
              >
                Check Availability
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContactClick("whatsapp", "dining_page")}
                className="inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal"
              >
                Ask About Dining →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
