import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PageHero } from "@/components/site/PageHero";
import { Reveal } from "@/components/site/Reveal";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";
import { trackCheckAvailabilityClick, trackContactClick } from "@/lib/analytics";
import { RESERVATIONS_NOTE } from "@/lib/contact";
import aerialImg from "@/assets/lodge-hero-aerial.jpg";
import riverWalk from "@/assets/xp-river-walk.jpg";
import deluxeInterior from "@/assets/riverfront-deluxe-interior.jpg";
import diningImg from "@/assets/dining-hero.jpg";

const CANONICAL = "https://mtoniriverlodge.com/mount-kilimanjaro-accommodation-arusha";

const KILI_FAQS: FAQItem[] = [
  {
    q: "Do you accommodate Mount Kilimanjaro climbers?",
    a: "Yes. Mtoni River Lodge is a popular base for climbers preparing for, or recovering from, Mount Kilimanjaro. Our reservations team coordinates early breakfasts, secure gear storage, quiet rooms, and transfers to and from Moshi or Kilimanjaro International Airport (JRO).",
  },
  {
    q: "Is Mtoni River Lodge suitable before climbing Kilimanjaro?",
    a: "It is. The lodge sits in a calm, low-altitude riverfront setting in Arusha — ideal for rest, hydration, and a final gear check before transferring to the Kilimanjaro trailheads. Wi-Fi, hot showers, and nutritious fresh meals are included.",
  },
  {
    q: "Is Mtoni River Lodge suitable after climbing Kilimanjaro?",
    a: "Yes — many summit returnees stay with us to recover. Expect a quiet riverside room, hot water on demand, comfortable bedding, nourishing meals, and the option of a slow river walk or pool time before continuing to a safari or onward flight.",
  },
  {
    q: "Can you assist with transfers related to Kilimanjaro expeditions?",
    a: "Yes. We arrange private transfers between the lodge and Moshi, Marangu, Machame, Londorossi or any climb operator's start point, plus airport pickup and drop-off at Kilimanjaro International Airport (JRO).",
  },
  {
    q: "Can early breakfasts be arranged for climbers?",
    a: "Absolutely. Let our team know your departure time at check-in and we will prepare an early breakfast or a packed breakfast so you leave for the gate fully fuelled.",
  },
  {
    q: "How far is the lodge from Kilimanjaro and the airport?",
    a: "The lodge is roughly a 50-minute drive from Kilimanjaro International Airport (JRO) and around 90 minutes from Moshi, the main staging town for Kilimanjaro climbs.",
  },
];

function LocalBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: "Mtoni River Lodge",
    description:
      "Riverfront nature lodge in Arusha, Tanzania — a quiet base for Mount Kilimanjaro climbers before and after summit, with transfers, early breakfasts, and recovery comfort.",
    url: CANONICAL,
    image: `https://mtoniriverlodge.com${aerialImg}`,
    telephone: "+255752441443",
    priceRange: "$$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Gomba Estate",
      addressLocality: "Arusha",
      addressCountry: "TZ",
    },
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Hot showers", value: true },
      { "@type": "LocationFeatureSpecification", name: "Free Wi-Fi", value: true },
      { "@type": "LocationFeatureSpecification", name: "Early breakfast for climbers", value: true },
      { "@type": "LocationFeatureSpecification", name: "Airport transfer", value: true },
    ],
  };
}

export const Route = createFileRoute("/mount-kilimanjaro-accommodation-arusha")({
  head: () => ({
    meta: [
      { title: "Mount Kilimanjaro Accommodation in Arusha | Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Stay at Mtoni River Lodge before or after your Mount Kilimanjaro adventure. Enjoy comfortable accommodation, peaceful surroundings, and easy access from Arusha.",
      },
      {
        property: "og:title",
        content: "Mount Kilimanjaro Accommodation in Arusha | Mtoni River Lodge",
      },
      {
        property: "og:description",
        content:
          "A calm riverfront retreat in Arusha for Mount Kilimanjaro climbers — pre-climb rest, post-summit recovery, and easy transfers.",
      },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: aerialImg },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: aerialImg },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      buildFAQJsonLd(KILI_FAQS),
      {
        type: "application/ld+json" as const,
        children: JSON.stringify(LocalBusinessJsonLd()),
      },
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Kilimanjaro Stays", path: "/mount-kilimanjaro-accommodation-arusha" },
      ]),
    ],
  }),
  component: KilimanjaroPage,
});

function KilimanjaroPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      <PageHero
        image={aerialImg}
        imageAlt="Mtoni River Lodge from above — a riverfront retreat in Arusha, Tanzania"
        eyebrow="Kilimanjaro stays"
        title={<>Mount Kilimanjaro<br />accommodation in Arusha.</>}
        subtitle="A quiet riverfront retreat for climbers preparing for the summit — and a restorative landing place for those returning from it."
      />

      {/* INTRO */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="eyebrow">A base by the river</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">
              The mountain is closer<br />from the calm of the river.
            </h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6 lg:col-start-7">
            <p className="text-lg leading-relaxed text-charcoal/80">
              Mtoni River Lodge sits on the banks of the Nduruma River in Arusha — a 50-minute drive from Kilimanjaro International Airport and the natural staging point for climbs of Africa's highest peak. Whether you are arriving for your first summit attempt or returning from the crater rim, the lodge is shaped for the kind of rest that climbers actually need: low altitude, deep quiet, hot water, and food that restores.
            </p>
            <p className="mt-6 text-base leading-relaxed text-charcoal/70">
              We host trekkers from every route — Machame, Marangu, Lemosho, Rongai, Umbwe — coordinating early breakfasts, gear storage, and private transfers in close contact with your climbing operator.
            </p>
          </Reveal>
        </div>
      </section>

      {/* BEFORE */}
      <section className="border-y border-border bg-bone px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-2">
          <Reveal>
            <div className="aspect-[4/5] overflow-hidden">
              <img src={riverWalk} alt="Quiet riverside walk before a Kilimanjaro climb" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </Reveal>
          <Reveal delay={150} className="self-center">
            <p className="eyebrow">Before your climb</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">Arrive calm.<br />Leave fully prepared.</h2>
            <ul className="mt-10 space-y-5 text-charcoal/80">
              {[
                "Low-altitude rest the night before transferring to the gate",
                "Quiet, river-facing rooms with blackout-friendly thatch",
                "Secure gear organisation and storage during your climb",
                "Early or packed breakfasts arranged with your operator",
                "Private transfers to Moshi, Marangu, Machame and Londorossi",
                "Reliable Wi-Fi for last-minute calls home",
              ].map((b) => (
                <li key={b} className="flex items-baseline gap-4 border-t border-charcoal/15 pt-4 text-base leading-relaxed">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-charcoal/70" />
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* AFTER */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-2">
          <Reveal delay={150} className="self-center lg:order-2">
            <p className="eyebrow">After your climb</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">Come down<br />into something soft.</h2>
            <ul className="mt-10 space-y-5 text-charcoal/80">
              {[
                "A hot shower and a deep bed waiting on arrival",
                "Nourishing, freshly prepared meals to rebuild reserves",
                "Quiet riverside walks at the pace of recovery",
                "Massage and slow pool time on request",
                "Flexible check-in for crews finishing late from the mountain",
                "Onward transfers to safari, Zanzibar, or the airport",
              ].map((b) => (
                <li key={b} className="flex items-baseline gap-4 border-t border-charcoal/15 pt-4 text-base leading-relaxed">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-charcoal/70" />
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal>
            <div className="aspect-[4/5] overflow-hidden">
              <img src={deluxeInterior} alt="Riverfront Deluxe room interior — recovery after a Kilimanjaro summit" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ACCOMMODATION OPTIONS */}
      <section className="border-t border-border bg-bone/40 px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <p className="eyebrow">Accommodation options</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">Three rooms by the river.<br />All trekker-friendly.</h2>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {[
              { to: "/rooms/riverfront-deluxe", name: "Riverfront Deluxe", note: "Closest to the water — our quietest sleep after a long descent." },
              { to: "/rooms/standard-river", name: "Riverfront Standard", note: "Balanced and calm — a solid base before transferring to the gate." },
              { to: "/rooms/family-room", name: "Family & Garden Suite", note: "Space for crews, climbing partners, or families regrouping after summit." },
            ].map((r) => (
              <Reveal key={r.to}>
                <Link to={r.to} className="group block border-t border-charcoal/15 pt-6">
                  <h3 className="font-display text-2xl">{r.name}</h3>
                  <p className="mt-3 text-charcoal/70">{r.note}</p>
                  <span className="mt-6 inline-block border-b border-charcoal pb-1 text-[0.7rem] uppercase tracking-[0.28em]">
                    Explore Room →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* DINING & RECOVERY */}
      <section className="grid lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden lg:aspect-auto lg:h-full">
          <img src={diningImg} alt="Fresh, nourishing meals at Mtoni River Lodge" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <div className="flex items-center bg-charcoal px-8 py-24 text-ivory lg:px-20">
          <Reveal>
            <p className="eyebrow !text-ivory/60">Dining &amp; recovery</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">Food that puts you back together.</h2>
            <p className="mt-8 text-ivory/80 leading-relaxed">
              Meals are prepared in our open kitchen from river-fed gardens and nearby farms — slow-cooked stews, charcoal-grilled vegetables, fresh tropical fruit, deep coffee, and herbal teas. Exactly what climbers ask for, on both sides of the mountain.
            </p>
            <Link to="/dining" className="mt-10 inline-flex items-center gap-3 border border-ivory px-7 py-4 text-[0.72rem] uppercase tracking-[0.28em] hover:bg-ivory hover:text-charcoal">
              Explore the kitchen →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* TRANSFERS & CONVENIENCE */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-[1100px]">
          <Reveal>
            <p className="eyebrow">Transfers &amp; convenience</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">Door-to-trailhead, handled.</h2>
          </Reveal>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["JRO airport pickup", "Private transfer from Kilimanjaro International Airport on your arrival day."],
              ["Trailhead transfer", "Coordinated drop-off at Machame, Marangu, Lemosho, Rongai or Umbwe gate timings."],
              ["Operator liaison", "We sync directly with your climb company so the handover is seamless."],
              ["Gear storage", "Leave non-climb luggage with us — your room or our secure store room."],
              ["Late check-in", "Flexible arrivals for crews coming off the mountain at dusk."],
              ["Onward planning", "Continue to a safari, to Zanzibar, or straight back to the airport."],
            ].map(([label, body]) => (
              <Reveal key={label as string}>
                <div className="border-t border-charcoal/15 pt-5">
                  <p className="eyebrow">{label}</p>
                  <p className="mt-3 text-charcoal/75">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <FAQ
        faqs={KILI_FAQS}
        eyebrow="Climber FAQ"
        heading="Planning a Kilimanjaro stay"
        intro="A few things our team is most often asked by climbers and their operators."
      />

      {/* CTA */}
      <section className="bg-charcoal px-6 py-24 text-center text-ivory lg:py-32">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <p className="eyebrow !text-ivory/60">Plan your climb stay</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-5xl">A quiet first night.<br />A soft return.</h2>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/book"
                onClick={() => trackCheckAvailabilityClick("kilimanjaro_landing_cta")}
                className="inline-flex items-center gap-3 border border-ivory bg-ivory px-7 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
              >
                Book Your Stay →
              </Link>
              <Link
                to="/contact"
                onClick={() => trackContactClick("contact", "kilimanjaro_landing_cta")}
                className="inline-flex items-center gap-3 border border-ivory/60 px-7 py-4 text-[0.72rem] uppercase tracking-[0.28em] hover:bg-ivory hover:text-charcoal"
              >
                Contact Us →
              </Link>
            </div>
            <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-ivory/65">{RESERVATIONS_NOTE}</p>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}