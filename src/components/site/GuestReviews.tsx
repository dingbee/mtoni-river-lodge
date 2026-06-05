import { Star } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";

const TRIPADVISOR_URL =
  "https://www.tripadvisor.com/Hotel_Review-g297913-d27185811-Reviews-Mtoni_River_Lodge-Arusha_Arusha_Region.html";

const reviews = [
  {
    title: "Beautiful lodge, conveniently located with amazing staff",
    quote:
      "It's always a treat to stay at Mtoni. By now, it feels like my home away from home whenever I'm in Arusha. Tom, Neema, and the entire team are attentive, supportive, and always welcoming. The lodge itself is a beautiful oasis, perfectly located between Kilimanjaro International Airport and Arusha town. You feel completely immersed in nature while remaining conveniently close to everything. I cannot recommend this place enough.",
    name: "Charissa",
    date: "June 2026",
    rating: 5,
  },
  {
    title: "Incredible Stay",
    quote:
      "Absolutely incredible stay at Mtoni River Lodge! We were here for a family wedding, and every aspect of our experience exceeded expectations. The staff were exceptionally helpful and made our stay one to remember. We look forward to returning.",
    name: "Si, Belinda, Simon & Debbie",
    date: "May 2026",
    rating: 5,
  },
  {
    title: "Relaxing by the River",
    quote:
      "Great surroundings, wonderful atmosphere, excellent service, and delicious food. The complete package when visiting Arusha. Babu looked after us exceptionally well, and the monkey watching provided endless entertainment for the kids. A truly relaxing and memorable experience.",
    name: "Deon L",
    date: "May 2026",
    rating: 5,
  },
];

function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex items-center gap-1 text-gold" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
      ))}
    </div>
  );
}

export function GuestReviews() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": reviews.map((r) => ({
      "@type": "Review",
      name: r.title,
      reviewBody: r.quote,
      author: { "@type": "Person", name: r.name },
      datePublished: r.date.replace(" ", "-"),
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      itemReviewed: {
        "@type": "LodgingBusiness",
        name: "Mtoni River Lodge",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Arusha",
          addressCountry: "TZ",
        },
      },
    })),
  };

  return (
    <section
      id="reviews"
      className="relative overflow-hidden px-6 py-32 lg:px-12 lg:py-48"
      style={{
        backgroundImage:
          "radial-gradient(1200px 600px at 15% 0%, rgba(180,160,120,0.10), transparent 60%), radial-gradient(900px 500px at 90% 100%, rgba(120,140,110,0.10), transparent 60%)",
        backgroundColor: "#f5f0e8",
      }}
    >
      {/* soft stone texture overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* Review Schema markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <div className="relative mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mx-auto max-w-[760px] text-center">
          <Reveal>
            <p className="eyebrow text-charcoal/60">Guest Experiences</p>
            <h2 className="mt-6 font-display text-4xl leading-[1.08] lg:text-6xl">
              Memorable stays shared by travelers from around the world.
            </h2>
          </Reveal>
        </div>

        {/* Summary strip */}
        <Reveal delay={120}>
          <div className="mx-auto mt-14 flex max-w-[760px] flex-col items-center justify-between gap-6 border-y border-charcoal/15 py-6 sm:flex-row sm:gap-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-4xl leading-none">4.9</span>
              <div className="flex flex-col gap-1">
                <Stars />
                <span className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">
                  Overall rating
                </span>
              </div>
            </div>
            <div className="text-center">
              <p className="font-display text-2xl leading-none">240+</p>
              <p className="mt-2 text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">
                Verified reviews
              </p>
            </div>
            <div className="text-center sm:text-right">
              <p className="font-display text-base italic text-charcoal/75">
                Trusted by travelers worldwide
              </p>
              <p className="mt-2 text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">
                Featured on TripAdvisor
              </p>
            </div>
          </div>
        </Reveal>

        {/* Review cards */}
        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-10">
          {reviews.map((r, i) => (
            <Reveal key={r.name} delay={i * 160}>
              <article
                className="group relative flex h-full flex-col justify-between rounded-2xl border border-charcoal/10 bg-ivory/80 p-8 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-charcoal/20 lg:p-10"
                style={{
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 60px -40px rgba(60,50,30,0.35), 0 8px 24px -16px rgba(60,50,30,0.18)",
                }}
              >
                <div>
                  <Stars count={r.rating} />
                  <p className="mt-5 font-display text-lg font-medium leading-snug text-charcoal/90 lg:text-xl">
                    {r.title}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-charcoal/75">
                    &ldquo;{r.quote}&rdquo;
                  </p>
                </div>
                <div className="mt-8 border-t border-charcoal/10 pt-5">
                  <p className="font-display text-base">{r.name}</p>
                  <p className="mt-1 text-[0.7rem] uppercase tracking-[0.28em] text-charcoal/55">
                    {r.date}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        {/* CTA */}
        <Reveal delay={200}>
          <div className="mt-16 flex flex-col items-center gap-4 lg:mt-20">
            <a
              href={TRIPADVISOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-full bg-[#2f4a3a] px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory shadow-[0_20px_40px_-20px_rgba(47,74,58,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#243a2d] hover:shadow-[0_28px_50px_-20px_rgba(47,74,58,0.75)]"
            >
              Read More Reviews on Tripadvisor
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                ↗
              </span>
            </a>
            <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/45">
              Independent guest reviews · TripAdvisor
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
