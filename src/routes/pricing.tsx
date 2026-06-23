import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import { ROOM_PATHS, type RoomSlug } from "@/lib/rooms";
import { getBasePriceLabel } from "@/lib/pricing";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import heroImg from "@/assets/hero-river.jpg";
import riverfrontDeluxe from "@/assets/riverfront-deluxe-interior.jpg";
import standardRiver from "@/assets/standard-river-exterior.jpg";
import familyRoom from "@/assets/family-room-hero.jpg";

const PRICING_FAQS: FAQItem[] = [
  {
    q: "Are rates per room or per person?",
    a: "Rates are quoted per room, per night, and include breakfast. The base rate covers two adults; extra adults or children aged 7 and older are charged a per-night supplement up to the room's maximum capacity.",
  },
  {
    q: "Do children pay the same rate as adults?",
    a: "Children under 6 stay free and are not counted toward the paying occupancy. Children aged 7 and older are counted as occupants and charged the same extra-occupant supplement as adults beyond the base two-guest rate.",
  },
  {
    q: "Is a deposit required to confirm a booking?",
    a: "Yes. A 50% deposit is collected at the time of booking through our secure payment partner, with the balance due on arrival. The deposit amount you pay always matches the total shown in your booking summary.",
  },
  {
    q: "What is included in the nightly rate?",
    a: "Every rate includes accommodation, breakfast, riverfront garden access, complimentary Wi-Fi, and personal hosting from our team. Taxes are additional; safaris, transfers, and additional meals can be added on request.",
  },
  {
    q: "Do rates change by season?",
    a: "Our published rates apply year-round for direct bookings. Seasonal adjustments or limited-time offers, when available, will be reflected in the booking summary before you confirm.",
  },
];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing & Stays — Mtoni River Lodge" },
      { name: "description", content: "Choose your stay at Mtoni River Lodge. Riverfront Deluxe, Riverfront Standard, and Family & Garden Suite — transparent nightly rates along the Nduruma River." },
      { property: "og:title", content: "Pricing & Stays — Mtoni River Lodge" },
      { property: "og:description", content: "Three accommodation tiers along the Nduruma River — transparent nightly rates and a quiet, riverside calm." },
      { property: "og:image", content: heroImg },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroImg },
    ],
    scripts: [buildFAQJsonLd(PRICING_FAQS)],
  }),
  component: PricingPage,
});

type Tier = {
  name: string;
  eyebrow: string;
  price: string;
  unit: string;
  blurb: string;
  features: string[];
  image: string;
  imageAlt: string;
  slug: RoomSlug;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Riverfront Deluxe",
    eyebrow: "Closest to the water",
    price: getBasePriceLabel("riverfront-deluxe"),
    unit: "per night",
    blurb: "Premium river-facing room with the lodge’s most uninterrupted views.",
    features: [
      "Premium river-facing room",
      "Best views of the water and surrounding nature",
      "Luxury bedding and upgraded interior finishes",
      "Private relaxation space",
    ],
    image: riverfrontDeluxe,
    imageAlt: "Interior of the Riverfront Deluxe room",
    slug: "riverfront-deluxe",
    featured: true,
  },
  {
    name: "Riverfront Standard",
    eyebrow: "Balanced & quiet",
    price: getBasePriceLabel("standard-river"),
    unit: "per night",
    blurb: "A calm, river-view sanctuary — simplicity carved from natural materials.",
    features: [
      "Comfortable river-view accommodation",
      "Balanced design of simplicity and comfort",
      "Ideal for couples or solo travelers",
      "Direct access to lodge amenities",
    ],
    image: standardRiver,
    imageAlt: "Exterior of the Standard River room",
    slug: "standard-river",
  },
  {
    name: "Family & Garden Suite",
    eyebrow: "Space to gather",
    price: getBasePriceLabel("family-room"),
    unit: "per night",
    blurb: "Generous, garden-facing layout shaped around shared moments.",
    features: [
      "Spacious family-friendly layout",
      "Garden-facing with natural surroundings",
      "Multiple bedding arrangements",
      "Designed for groups and longer stays",
    ],
    image: familyRoom,
    imageAlt: "Family & Garden Suite at Mtoni River Lodge",
    slug: "family-room",
  },
];

function PricingPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <PageHero
        image={heroImg}
        imageAlt="The Nduruma River at dawn"
        eyebrow="Stays · Rates"
        title={<>Stay by the River.<br />Choose Your Experience.</>}
        subtitle="Three accommodations along the Nduruma River — each grounded in earth, thatch, and the quiet rhythm of the water. Transparent nightly rates, with breakfast and personal hosting included."
      />

      <section className="px-6 pb-24 lg:px-12 lg:pb-40">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
            {TIERS.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 120}>
                <PricingCard tier={tier} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={300}>
            <p className="mx-auto mt-16 max-w-2xl text-center text-xs uppercase tracking-[0.28em] text-charcoal/55">
              Rates are per room, per night · Includes breakfast · Taxes additional · Seasonal pricing may apply
            </p>
          </Reveal>
        </div>
      </section>

      <FAQ
        faqs={PRICING_FAQS}
        eyebrow="Rates & booking"
        heading="Frequently asked questions"
      />

      <SiteFooter />
    </div>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden border bg-ivory transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(30,45,30,0.35)] ${
        tier.featured ? "border-charcoal/30" : "border-charcoal/10"
      }`}
    >
      {tier.featured && (
        <div
          className="absolute right-4 top-4 z-10 px-3 py-1 text-[0.6rem] font-medium uppercase tracking-[0.24em]"
          style={{ backgroundColor: "#C0B87A", color: "#1E2D1E" }}
        >
          Most Loved
        </div>
      )}

      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={tier.image}
          alt={tier.imageAlt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal/30 via-transparent to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-8 lg:p-10">
        <p className="eyebrow text-charcoal/60">{tier.eyebrow}</p>
        <h2 className="mt-3 font-display text-3xl lg:text-[2.125rem] leading-tight">{tier.name}</h2>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="text-[0.65rem] uppercase tracking-[0.24em] text-charcoal/55">From</span>
          <span className="font-display text-4xl">{tier.price}</span>
          <span className="text-xs uppercase tracking-[0.2em] text-charcoal/55">/ {tier.unit}</span>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-charcoal/75">{tier.blurb}</p>

        <ul className="mt-6 space-y-3 border-t border-charcoal/10 pt-6">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-charcoal/80">
              <Check className="mt-0.5 h-4 w-4 flex-none text-charcoal/60" strokeWidth={1.5} />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex-1" />

        <div className="mt-2 flex flex-col gap-3">
          <Link
            to={ROOM_PATHS[tier.slug]}
            className={`group/explore inline-flex items-center justify-center gap-3 px-6 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] transition-colors ${
              tier.featured
                ? "bg-charcoal text-ivory hover:bg-charcoal/90"
                : "border border-charcoal text-charcoal hover:bg-charcoal hover:text-ivory"
            }`}
          >
            <span>Explore More</span>
            <span className="transition-transform group-hover/explore:translate-x-1">→</span>
          </Link>
          <Link
            to="/book"
            className={`group/book inline-flex items-center justify-center gap-3 px-6 py-3 text-[0.72rem] font-medium uppercase tracking-[0.28em] transition-colors ${
              tier.featured
                ? "border border-charcoal text-charcoal hover:bg-charcoal hover:text-ivory"
                : "text-charcoal/70 hover:text-charcoal underline underline-offset-[6px] decoration-charcoal/30 hover:decoration-charcoal"
            }`}
          >
            <span>Book This Room</span>
          </Link>
        </div>
      </div>
    </article>
  );
}