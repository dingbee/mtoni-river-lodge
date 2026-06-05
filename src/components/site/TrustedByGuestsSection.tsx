import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { TripadvisorExcellentWidget } from "@/components/site/TripadvisorExcellentWidget";
import { trackCheckAvailabilityClick } from "@/lib/analytics";

const TRIPADVISOR_URL =
  "https://www.tripadvisor.com/Hotel_Review-g297913-d27185811-Reviews-Mtoni_River_Lodge-Arusha_Arusha_Region.html";

const trustPillars = [
  {
    title: "Personalised Service",
    body: "Guests are welcomed by name and looked after by a team that anticipates the small details.",
  },
  {
    title: "Tranquil Riverside Setting",
    body: "An intimate retreat on the Nduruma River — birdsong, water and quiet, just outside Arusha.",
  },
  {
    title: "Convenient Arusha Location",
    body: "Perfectly placed between Kilimanjaro International Airport and Arusha town for safari arrivals.",
  },
  {
    title: "Authentic Tanzanian Hospitality",
    body: "Warm, attentive care rooted in local craftsmanship, cuisine and culture.",
  },
];

const reviewHighlights = [
  "Beautiful lodge, conveniently located with amazing staff.",
  "An incredible stay — every detail exceeded our expectations.",
  "Great surroundings, wonderful atmosphere and delicious food.",
];

export function TrustedByGuestsSection() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: "Mtoni River Lodge",
    description:
      "Mtoni River Lodge is a luxury riverside lodge in Arusha, Tanzania, offering tranquil accommodation, personalised service and authentic Tanzanian hospitality.",
    url: "https://mtoniriverlodge.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Arusha",
      addressRegion: "Arusha",
      addressCountry: "TZ",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "240",
      bestRating: "5",
      worstRating: "1",
    },
    sameAs: [TRIPADVISOR_URL],
  };

  return (
    <section
      id="guest-reviews-recognition"
      aria-labelledby="trusted-by-guests-heading"
      className="relative overflow-hidden px-6 py-28 lg:px-12 lg:py-40"
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 10% 0%, rgba(180,160,120,0.10), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(120,140,110,0.10), transparent 60%)",
        backgroundColor: "#f7f3ec",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* Subtle texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      <div className="relative mx-auto max-w-[1200px]">
        {/* Heading */}
        <div className="mx-auto max-w-[760px] text-center">
          <Reveal>
            <p className="eyebrow text-charcoal/60">Guest Reviews &amp; Recognition</p>
            <h2
              id="trusted-by-guests-heading"
              className="mt-6 font-display text-4xl leading-[1.08] lg:text-6xl"
            >
              Trusted by Guests from Around the World
            </h2>
            <p className="mx-auto mt-6 max-w-[620px] text-base leading-relaxed text-charcoal/70 lg:text-lg">
              Discover why travelers consistently rate Mtoni River Lodge among Arusha's
              most memorable stays — a trusted name for luxury accommodation in Arusha,
              recognised by guest reviews from across the globe.
            </p>
          </Reveal>
        </div>

        {/* Widget */}
        <Reveal delay={120}>
          <div className="mx-auto mt-14 flex flex-col items-center gap-6 lg:mt-16">
            <div className="rounded-2xl border border-charcoal/10 bg-ivory/80 px-8 py-8 shadow-[0_30px_60px_-40px_rgba(60,50,30,0.35)] backdrop-blur-sm">
              <TripadvisorExcellentWidget />
              <p className="mt-4 text-center text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">
                Tripadvisor · Travellers' Excellent
              </p>
            </div>
          </div>
        </Reveal>

        {/* CTAs */}
        <Reveal delay={180}>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={TRIPADVISOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-full bg-[#2f4a3a] px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory shadow-[0_20px_40px_-20px_rgba(47,74,58,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#243a2d]"
            >
              Read Guest Reviews
              <span aria-hidden className="transition-transform group-hover:translate-x-1">↗</span>
            </a>
            <Link
              to="/book"
              onClick={() => trackCheckAvailabilityClick("homepage_reviews_recognition")}
              className="inline-flex items-center gap-3 rounded-full border border-charcoal/40 px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:border-charcoal hover:bg-charcoal hover:text-ivory"
            >
              Book Your Stay
            </Link>
          </div>
        </Reveal>

        {/* Review highlights */}
        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {reviewHighlights.map((q, i) => (
            <Reveal key={i} delay={i * 140}>
              <figure className="h-full rounded-2xl border border-charcoal/10 bg-ivory/70 p-8 backdrop-blur-sm">
                <span aria-hidden className="font-display text-4xl leading-none text-charcoal/30">
                  &ldquo;
                </span>
                <blockquote className="mt-2 font-display text-lg leading-snug text-charcoal/85">
                  {q}
                </blockquote>
                <figcaption className="mt-5 text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">
                  Verified guest · Tripadvisor
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        {/* Trust pillars */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {trustPillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 120}>
              <div className="h-full rounded-xl border border-charcoal/10 bg-ivory/60 p-6">
                <p className="font-display text-base text-charcoal">{p.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-charcoal/70">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustedByGuestsSection;