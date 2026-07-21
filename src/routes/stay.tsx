import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Waves,
  Leaf,
  Compass,
  Mountain,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import { seoMeta, type ResolvedSeo } from "@/lib/seo-head";
import { trackCheckAvailabilityClick } from "@/lib/analytics";
import { ROOMS, getRoomPath, type RoomSlug } from "@/lib/rooms";
import heroImg from "@/assets/hero-river.jpg";
import heroImg800 from "@/assets/hero-river-800w.webp";
import heroImg1600 from "@/assets/hero-river-1600w.webp";
import palmGardenJpg from "@/assets/palm-garden.jpg.asset.json";
import diningImg from "@/assets/xp-bonfire.jpg";
import xpCanoe from "@/assets/xp-canoe.jpg";
import xpMarket from "@/assets/xp-market.jpg";
import xpCycling from "@/assets/xp-cycling.jpg";
import xpWaterfall from "@/assets/xp-waterfall.jpg";
import xpHotsprings from "@/assets/xp-hotsprings.jpg";
import forestLightJpg from "@/assets/forest-light.jpg.asset.json";

/* ────────────── Brand palette (Google Ads landing) ────────────── */
const BRAND = {
  primary: "#346739",
  forest: "#427A43",
  gold: "#C0B87A",
  cream: "#F2E3BB",
};

/* ────────────── Content ────────────── */

const STAY_FAQS: FAQItem[] = [
  {
    q: "Where is Mtoni River Lodge located?",
    a: "Mtoni River Lodge is a peaceful riverside lodge on the banks of the Nduruma River in Arusha, Northern Tanzania — approximately 50 minutes from Kilimanjaro International Airport and well placed for Northern Tanzania safaris.",
  },
  {
    q: "Is Mtoni River Lodge suitable before climbing Kilimanjaro?",
    a: "Yes. Mtoni is a popular pre-climb base and post-summit recovery stay for Kilimanjaro trekkers. We offer early breakfasts, gear storage, and private transfers to and from Kilimanjaro trailheads.",
  },
  {
    q: "What activities are available near Mtoni River Lodge?",
    a: "Guests enjoy Lake Duluti canoeing, local market tours, mountain biking, waterfall excursions, and visits to the Maji Moto hot springs — alongside safari day trips to Arusha National Park, Tarangire, Lake Manyara, Ngorongoro, and the Serengeti.",
  },
  {
    q: "Does Mtoni River Lodge accommodate families?",
    a: "Yes. Our Family & Group Room sleeps up to 5 guests in a spacious, flexible layout designed for families and small groups travelling together.",
  },
  {
    q: "How do I book my stay?",
    a: "Book directly through the Mtoni booking engine — check live availability, choose your room, and secure your stay in a few steps. Direct booking guarantees the best available rate.",
  },
];

const ROOM_DETAILS: Record<RoomSlug, { price: string; sleeps: string; blurb: string }> = {
  "standard-river": {
    price: "From $260 / night",
    sleeps: "Sleeps up to 3 guests",
    blurb: "Comfortable accommodation set close to nature — ideal for couples and small families.",
  },
  "riverfront-deluxe": {
    price: "From $310 / night",
    sleeps: "Sleeps up to 3 guests",
    blurb: "Enhanced riverside comfort with direct river views — a relaxing, elevated retreat.",
  },
  "family-room": {
    price: "From $550 / night",
    sleeps: "Sleeps up to 5 guests",
    blurb: "Spacious, flexible accommodation designed for families and groups travelling together.",
  },
};

const REASONS = [
  {
    title: "Riverside Location",
    body: "Wake to the sound of the Nduruma River flowing through mature gardens.",
    Icon: Waves,
  },
  {
    title: "Peaceful Natural Environment",
    body: "Twenty-four rooms set within a quiet, tree-lined riverside estate.",
    Icon: Leaf,
  },
  {
    title: "Safari Gateway",
    body: "Perfectly placed for Arusha, Tarangire, Ngorongoro, and Serengeti journeys.",
    Icon: Compass,
  },
  {
    title: "Kilimanjaro Base",
    body: "A low-altitude retreat for climbers — before the ascent and after the summit.",
    Icon: Mountain,
  },
  {
    title: "Authentic Hospitality",
    body: "Personal, unhurried service from a team that treats every guest as family.",
    Icon: HeartHandshake,
  },
  {
    title: "Direct Secure Booking",
    body: "Book directly for our best available rate and instant confirmation.",
    Icon: ShieldCheck,
  },
];

const EXPERIENCES = [
  { title: "Lake Duluti Canoeing", img: xpCanoe },
  { title: "Local Market Tours", img: xpMarket },
  { title: "Mountain Biking", img: xpCycling },
  { title: "Waterfall Excursion", img: xpWaterfall },
  { title: "Maji Moto Hot Springs", img: xpHotsprings },
];

const TESTIMONIALS = [
  {
    name: "Elena & Marco",
    origin: "Italy",
    body:
      "A peaceful, beautifully kept lodge by the river. The team made our pre-Kilimanjaro stay effortless — we returned after the climb and it felt like coming home.",
  },
  {
    name: "The Adeyemi Family",
    origin: "United Kingdom",
    body:
      "Perfect base before our northern safari. Our family room was spacious, the breakfasts were generous, and the gardens made the children feel completely free.",
  },
  {
    name: "Sarah H.",
    origin: "United States",
    body:
      "Genuinely one of the most restorative places we've stayed in East Africa. Elegant, quiet, and warm — everything you want after long travel days.",
  },
];

/* ────────────── Route ────────────── */

export const Route = createFileRoute("/stay")({
  head: () => {
    const seo: ResolvedSeo = {
      title: "Stay at Mtoni River Lodge | Riverside Lodge in Arusha Tanzania",
      description:
        "Book your stay at Mtoni River Lodge, a peaceful riverside lodge in Arusha, Tanzania. Perfect for safari travellers, Kilimanjaro climbers, couples, families and adventure seekers.",
      canonical: "https://mtoniriverlodge.com/stay",
      ogTitle: "Stay at Mtoni River Lodge — Riverside Lodge in Arusha, Tanzania",
      ogDescription:
        "Peaceful riverside accommodation in Arusha, Tanzania. Your gateway to safari adventures, Kilimanjaro journeys, and authentic Tanzania experiences.",
      ogImage: heroImg,
      twitterCard: "summary_large_image",
      twitterImage: heroImg,
      robots: "index,follow",
      schemaType: null,
    };

    const hotelSchema = {
      type: "application/ld+json" as const,
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Hotel",
        name: "Mtoni River Lodge",
        url: "https://mtoniriverlodge.com/stay",
        image: heroImg,
        description:
          "A peaceful riverside lodge in Arusha, Tanzania — a gateway to safari, Kilimanjaro, and authentic Northern Tanzania experiences.",
        priceRange: "$$$",
        starRating: { "@type": "Rating", ratingValue: "4" },
        address: {
          "@type": "PostalAddress",
          streetAddress: "Nduruma River",
          addressLocality: "Arusha",
          addressRegion: "Arusha",
          addressCountry: "TZ",
        },
        geo: { "@type": "GeoCoordinates", latitude: -3.3869, longitude: 36.6822 },
        amenityFeature: [
          { "@type": "LocationFeatureSpecification", name: "Riverside garden" },
          { "@type": "LocationFeatureSpecification", name: "Breakfast included" },
          { "@type": "LocationFeatureSpecification", name: "Airport transfers" },
          { "@type": "LocationFeatureSpecification", name: "Safari & Kilimanjaro planning" },
        ],
        makesOffer: ROOMS.map((r) => ({
          "@type": "Offer",
          name: r.name,
          priceCurrency: "USD",
          price: ROOM_DETAILS[r.slug].price.replace(/[^0-9]/g, ""),
          url: `https://mtoniriverlodge.com${getRoomPath(r.slug)}`,
        })),
      }),
    };

    const localBusinessSchema = {
      type: "application/ld+json" as const,
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "LodgingBusiness",
        name: "Mtoni River Lodge",
        url: "https://mtoniriverlodge.com/stay",
        image: heroImg,
        telephone: "+255",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Arusha",
          addressRegion: "Northern Tanzania",
          addressCountry: "TZ",
        },
        areaServed: ["Arusha", "Kilimanjaro", "Northern Tanzania"],
      }),
    };

    const breadcrumbSchema = {
      type: "application/ld+json" as const,
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://mtoniriverlodge.com/" },
          { "@type": "ListItem", position: 2, name: "Stay", item: "https://mtoniriverlodge.com/stay" },
        ],
      }),
    };

    return {
      meta: seoMeta(seo),
      links: [
        {
          rel: "preload",
          as: "image",
          href: heroImg800,
          type: "image/webp",
          imagesrcset: `${heroImg800} 800w, ${heroImg1600} 1600w`,
          imagesizes: "100vw",
          fetchpriority: "high",
        },
        { rel: "canonical", href: seo.canonical },
      ],
      scripts: [buildFAQJsonLd(STAY_FAQS), hotelSchema, localBusinessSchema, breadcrumbSchema],
    };
  },
  component: StayLandingPage,
});

/* ────────────── Page ────────────── */

function StayLandingPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      {/* 1. HERO */}
      <section
        aria-labelledby="stay-hero-heading"
        className="relative flex min-h-[92vh] items-end overflow-hidden"
      >
        <picture className="absolute inset-0">
          <source type="image/webp" srcSet={`${heroImg800} 800w, ${heroImg1600} 1600w`} sizes="100vw" />
          <img
            src={heroImg}
            alt="Mtoni River Lodge on the banks of the Nduruma River in Arusha, Tanzania"
            className="h-full w-full object-cover"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,25,20,0.30) 0%, rgba(20,25,20,0.15) 40%, rgba(20,25,20,0.75) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-20 pt-32 text-ivory lg:px-12 lg:pb-28">
          <Reveal>
            <p
              className="eyebrow"
              style={{ color: BRAND.cream }}
            >
              Arusha · Northern Tanzania
            </p>
            <h1
              id="stay-hero-heading"
              className="mt-6 max-w-4xl font-display text-5xl leading-[1.02] sm:text-6xl lg:text-8xl"
            >
              Stay at Mtoni River Lodge
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ivory/90 lg:text-xl">
              Experience peaceful riverside accommodation in Arusha, Tanzania — your gateway to
              safari adventures, Kilimanjaro journeys, and unforgettable experiences.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/book"
                onClick={() => trackCheckAvailabilityClick("stay_landing_hero")}
                className="group inline-flex items-center gap-3 px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-opacity hover:opacity-90"
                style={{ backgroundColor: BRAND.primary }}
              >
                Check Availability
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a
                href="#stay-rooms"
                className="inline-flex items-center gap-2 border-b pb-1 text-[0.72rem] uppercase tracking-[0.28em] text-ivory"
                style={{ borderColor: BRAND.gold }}
              >
                Explore Rooms →
              </a>
            </div>

            <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[0.72rem] uppercase tracking-[0.24em] text-ivory/85">
              {[
                "Riverside Location",
                "Direct Booking",
                "Arusha, Tanzania",
                "Safari & Kilimanjaro Gateway",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: BRAND.gold }}
                  />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 2. INTRODUCTION */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto grid max-w-[1300px] items-center gap-14 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:col-span-6">
            <p className="eyebrow" style={{ color: BRAND.primary }}>
              A Riverside Retreat
            </p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
              More Than Just a<br />Place to Stay
            </h2>
            <p className="mt-8 text-base leading-relaxed text-charcoal/75 lg:text-lg">
              Mtoni River Lodge is a peaceful retreat surrounded by nature on the banks of the
              Nduruma River — a graceful base for travellers exploring Northern Tanzania.
            </p>
            <ul className="mt-8 grid gap-3 text-sm text-charcoal/80 sm:grid-cols-2">
              {[
                "Safari travellers",
                "Kilimanjaro climbers",
                "Couples on retreat",
                "Families & groups",
                "Adventure travellers",
                "Slow travel & recovery",
              ].map((b) => (
                <li key={b} className="flex items-baseline gap-3">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: BRAND.forest }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6">
            <div className="aspect-[4/5] overflow-hidden">
              <img
                src={palmGardenJpg.url}
                alt="Stone pathway winding through the tropical garden at Mtoni River Lodge"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* 3. ROOM OPTIONS */}
      <section
        id="stay-rooms"
        aria-labelledby="stay-rooms-heading"
        className="bg-bone px-6 py-24 lg:px-12 lg:py-32"
      >
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <p className="eyebrow" style={{ color: BRAND.primary }}>Choose Your Room</p>
            <h2
              id="stay-rooms-heading"
              className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl"
            >
              Riverside Rooms & Suites
            </h2>
            <p className="mt-6 text-base leading-relaxed text-charcoal/70 lg:text-lg">
              Thoughtfully designed accommodation from intimate couples’ rooms to spacious family
              suites — every stay includes breakfast, personal hosting, and access to our
              riverside gardens.
            </p>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {ROOMS.map((room, i) => {
              const meta = ROOM_DETAILS[room.slug];
              return (
                <Reveal key={room.slug} delay={i * 120}>
                  <article className="group flex h-full flex-col bg-ivory">
                    <Link to={getRoomPath(room.slug)} className="block overflow-hidden">
                      <div className="aspect-[4/5] overflow-hidden">
                        <img
                          src={room.img}
                          alt={`${room.name} at Mtoni River Lodge`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out motion-safe:md:group-hover:scale-[1.04]"
                        />
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col p-6 lg:p-8">
                      <h3 className="font-display text-2xl lg:text-3xl">{room.name}</h3>
                      <p
                        className="mt-3 text-[0.72rem] uppercase tracking-[0.24em]"
                        style={{ color: BRAND.forest }}
                      >
                        {meta.sleeps}
                      </p>
                      <p className="mt-4 text-sm leading-relaxed text-charcoal/75">{meta.blurb}</p>
                      <p
                        className="mt-6 font-display text-2xl"
                        style={{ color: BRAND.primary }}
                      >
                        {meta.price}
                      </p>
                      <div className="mt-6 flex items-center gap-4">
                        <Link
                          to="/book"
                          search={{ room: room.slug }}
                          onClick={() => trackCheckAvailabilityClick(`stay_room_${room.slug}`)}
                          className="inline-flex items-center gap-2 px-5 py-3 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-opacity hover:opacity-90"
                          style={{ backgroundColor: BRAND.primary }}
                        >
                          Book This Room →
                        </Link>
                        <Link
                          to={getRoomPath(room.slug)}
                          className="border-b pb-1 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal/80"
                          style={{ borderColor: BRAND.gold }}
                        >
                          Details →
                        </Link>
                      </div>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. WHY CHOOSE MTONI */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-[1300px]">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <p className="eyebrow" style={{ color: BRAND.primary }}>Why Mtoni</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
              A Retreat Designed<br />Around Your Journey
            </h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {REASONS.map((r, i) => (
              <Reveal key={r.title} delay={i * 80}>
                <div
                  className="group h-full border p-8 transition-colors hover:border-gold/40"
                  style={{ borderColor: `${BRAND.gold}55`, backgroundColor: "#FBF7EC" }}
                >
                  <div
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full border transition-colors group-hover:border-gold/60"
                    aria-hidden
                    style={{ borderColor: `${BRAND.gold}66`, color: BRAND.primary }}
                  >
                    <r.Icon size={24} strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-6 font-display text-xl lg:text-2xl">{r.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-charcoal/75">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. EXPERIENCES */}
      <section className="bg-bone px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <p className="eyebrow" style={{ color: BRAND.primary }}>Days Beyond the Lodge</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
              Discover Arusha<br />Beyond Your Room
            </h2>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
            {EXPERIENCES.map((e, i) => (
              <Reveal key={e.title} delay={i * 80}>
                <article className="group h-full">
                  <div className="aspect-[3/4] overflow-hidden">
                    <img
                      src={e.img}
                      alt={`${e.title} near Mtoni River Lodge, Arusha`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out motion-safe:md:group-hover:scale-[1.05]"
                    />
                  </div>
                  <h3 className="mt-5 font-display text-lg lg:text-xl">{e.title}</h3>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200} className="mt-16 flex justify-center">
            <Link
              to="/experiences"
              className="inline-flex items-center gap-3 border px-7 py-3.5 text-[0.72rem] uppercase tracking-[0.28em]"
              style={{ borderColor: BRAND.primary, color: BRAND.primary }}
            >
              Explore Experiences →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* 6. KILIMANJARO */}
      <section
        className="relative overflow-hidden px-6 py-24 text-ivory lg:px-12 lg:py-32"
        style={{ backgroundColor: BRAND.primary }}
      >
        <img
          src={forestLightJpg.url}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="relative mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-6">
            <p className="eyebrow" style={{ color: BRAND.cream }}>Kilimanjaro Base</p>
            <h2 className="mt-6 font-display text-4xl leading-[1.05] lg:text-6xl">
              The Perfect Stay<br />Before Kilimanjaro
            </h2>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6">
            <p className="text-lg leading-relaxed text-ivory/90">
              Mtoni River Lodge provides climbers with a peaceful place to prepare before their
              mountain adventure and recover after their journey. A 50-minute drive from
              Kilimanjaro International Airport, we coordinate early breakfasts, gear storage, and
              private transfers with your climbing operator.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/book"
                onClick={() => trackCheckAvailabilityClick("stay_landing_kilimanjaro")}
                className="inline-flex items-center gap-3 px-7 py-3.5 text-[0.72rem] uppercase tracking-[0.28em]"
                style={{ backgroundColor: BRAND.gold, color: "#1a1a1a" }}
              >
                Book Your Stay →
              </Link>
              <Link
                to="/mount-kilimanjaro-accommodation-arusha"
                className="border-b pb-1 text-[0.72rem] uppercase tracking-[0.28em] text-ivory"
                style={{ borderColor: BRAND.cream }}
              >
                Climber Stays →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 7. DINING & RELAXATION */}
      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto grid max-w-[1300px] items-center gap-14 lg:grid-cols-12 lg:gap-20">
          <Reveal className="lg:col-span-6">
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={diningImg}
                alt="Evening bonfire gathering at Mtoni River Lodge"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-6">
            <p className="eyebrow" style={{ color: BRAND.primary }}>Dining & Relaxation</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-5xl">
              Slow mornings, warm evenings.
            </h2>
            <ul className="mt-8 space-y-4 text-base text-charcoal/80">
              {[
                { t: "Generous breakfast", d: "Served riverside every morning, included with every stay." },
                { t: "Riverside relaxation", d: "Quiet corners, tropical gardens, and the sound of the river." },
                { t: "Local cuisine", d: "Thoughtful menus rooted in Tanzanian ingredients and hospitality." },
                { t: "Comfortable evenings", d: "Lantern-lit dining, fireside conversation, and deep sleep." },
              ].map((r) => (
                <li key={r.t} className="flex gap-4">
                  <span
                    className="mt-2 h-1.5 w-6 shrink-0"
                    style={{ backgroundColor: BRAND.gold }}
                  />
                  <div>
                    <p className="font-display text-lg">{r.t}</p>
                    <p className="text-sm text-charcoal/70">{r.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 8. TESTIMONIALS */}
      <section
        className="px-6 py-24 lg:px-12 lg:py-32"
        style={{ backgroundColor: "#FBF7EC" }}
      >
        <div className="mx-auto max-w-[1300px]">
          <Reveal className="mx-auto mb-14 max-w-2xl text-center">
            <p className="eyebrow" style={{ color: BRAND.primary }}>Guest Voices</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-5xl">
              Loved by travellers to Arusha
            </h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <figure
                  className="flex h-full flex-col bg-ivory p-8 shadow-sm"
                  style={{ borderTop: `2px solid ${BRAND.primary}` }}
                >
                  <div
                    className="text-sm tracking-[0.3em]"
                    style={{ color: BRAND.gold }}
                    aria-label="5 out of 5 stars"
                  >
                    ★★★★★
                  </div>
                  <blockquote className="mt-5 text-base leading-relaxed text-charcoal/85">
                    “{t.body}”
                  </blockquote>
                  <figcaption className="mt-6 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal/70">
                    {t.name} · {t.origin}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 9. FAQ */}
      <FAQ
        eyebrow="Frequently Asked"
        heading="Planning your stay"
        faqs={STAY_FAQS}
      />

      {/* 10. FINAL CTA */}
      <section
        className="relative overflow-hidden px-6 py-32 text-ivory lg:px-12 lg:py-40"
        style={{ backgroundColor: "#1F3A22" }}
      >
        <img
          src={heroImg}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="eyebrow" style={{ color: BRAND.cream }}>
            Your Riverside Retreat in Arusha
          </p>
          <h2 className="mt-6 font-display text-5xl leading-[1.02] lg:text-7xl">
            Ready to Experience<br />Mtoni?
          </h2>
          <p className="mt-6 text-lg text-ivory/85">
            Reserve your riverside escape in Arusha today.
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              to="/book"
              onClick={() => trackCheckAvailabilityClick("stay_landing_final_cta")}
              className="group inline-flex items-center gap-3 px-9 py-4 text-[0.72rem] uppercase tracking-[0.28em]"
              style={{ backgroundColor: BRAND.gold, color: "#1a1a1a" }}
            >
              Book Your Stay
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
