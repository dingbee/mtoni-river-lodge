import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import hero from "@/assets/lodge-hero-aerial.jpg";
import { buildBreadcrumbJsonLd, absoluteUrl } from "@/lib/seo-schema";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";

const TITLE = "Where to Stay Before Climbing Mount Kilimanjaro";
const PAGE_TITLE = `${TITLE} | Mtoni River Lodge`;
const DESCRIPTION =
  "Planning to climb Mount Kilimanjaro? Discover why staying in Arusha before your trek improves your experience and why Mtoni River Lodge is the ideal place to rest before and after your adventure.";
const ROUTE = "/journal/where-to-stay-before-climbing-mount-kilimanjaro";
const URL = absoluteUrl(ROUTE);
const HERO_URL = absoluteUrl(hero);
const PUBLISHED = "2026-06-29";

const FAQS: ReadonlyArray<FAQItem> = [
  {
    q: "How many days should I stay in Arusha before climbing Kilimanjaro?",
    a: "Most climbers spend one to two nights in Arusha before their trek. This allows time to recover from long-haul flights, complete equipment checks with your guide, and acclimatise to the altitude and climate before transferring to the mountain.",
  },
  {
    q: "Where should I stay before climbing Mount Kilimanjaro?",
    a: "Choose accommodation that is peaceful, well-rested, and conveniently located between Kilimanjaro International Airport and the trail heads. A nature-led lodge in Arusha — with comfortable beds, fresh meals, and quiet surroundings — gives you a stronger physical and mental start than a busy city hotel.",
  },
  {
    q: "Can I stay after climbing Kilimanjaro?",
    a: "Yes. Many climbers extend their stay for one or two nights after the summit to recover before flying home or continuing on safari. Hot showers, restful sleep, nourishing food, and a calm environment all help the body recover from the climb.",
  },
  {
    q: "Is Mtoni River Lodge suitable for climbers?",
    a: "Mtoni River Lodge is well suited to Kilimanjaro climbers. The riverfront setting is quiet, the rooms are designed for deep rest, and our team is experienced in coordinating early breakfasts, secure luggage storage, and transfers to and from the trail heads.",
  },
  {
    q: "Can early breakfast be arranged?",
    a: "Yes. Climbers often leave for the mountain very early, and our kitchen can prepare an early breakfast on request. Please let us know your departure time when you book or on check-in.",
  },
  {
    q: "Can transport assistance be arranged?",
    a: "Yes. We can help coordinate airport transfers from Kilimanjaro International Airport (JRO) and transport to your Kilimanjaro trek operator or trail head. Please share your itinerary in advance so we can plan smoothly.",
  },
];

const RELATED = [
  {
    to: "/mount-kilimanjaro-accommodation-arusha",
    label: "Mount Kilimanjaro Accommodation in Arusha",
    description: "Our dedicated guide for climbers staying before and after the trek.",
  },
  {
    to: "/rooms",
    label: "Rooms at Mtoni River Lodge",
    description: "Riverfront rooms designed for deep, uninterrupted rest.",
  },
  {
    to: "/dining",
    label: "Dining at Mtoni",
    description: "Fresh, nourishing meals to fuel and recover from the mountain.",
  },
  {
    to: "/experiences",
    label: "Experiences Around the Lodge",
    description: "Gentle walks and cultural visits for the days before your climb.",
  },
  {
    to: "/journal/perfect-arusha-stay-for-safari-travelers-2026",
    label: "The Perfect Arusha Stay for Safari Travelers",
    description: "Why Mtoni is the chosen base for travellers heading into Northern Tanzania.",
  },
];

const linkCls =
  "underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal";

export const Route = createFileRoute(
  "/journal/where-to-stay-before-climbing-mount-kilimanjaro",
)({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "keywords", content: "where to stay before climbing Mount Kilimanjaro, Mount Kilimanjaro accommodation, Arusha lodge, Arusha accommodation, Kilimanjaro climbers lodge, accommodation before Kilimanjaro, Kilimanjaro trekking, where to stay in Arusha, Tanzania travel" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: HERO_URL },
      { property: "og:image:alt", content: "Aerial view of Mtoni River Lodge in Arusha, a peaceful Kilimanjaro climber base" },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "article:published_time", content: PUBLISHED },
      { property: "article:section", content: "Travel Guide" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: HERO_URL },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: TITLE,
          description: DESCRIPTION,
          image: {
            "@type": "ImageObject",
            url: HERO_URL,
            caption:
              "Aerial view of Mtoni River Lodge in Arusha — a peaceful base before climbing Mount Kilimanjaro",
          },
          datePublished: PUBLISHED,
          dateModified: PUBLISHED,
          author: { "@type": "Organization", name: "Mtoni River Lodge" },
          publisher: {
            "@type": "Organization",
            name: "Mtoni River Lodge",
            logo: {
              "@type": "ImageObject",
              url: "https://mtoniriverlodge.com/favicon.ico",
            },
          },
          mainEntityOfPage: { "@type": "WebPage", "@id": URL },
          articleSection: "Travel Guide",
          keywords: [
            "Mount Kilimanjaro",
            "Arusha",
            "Accommodation",
            "Travel Tips",
            "Tanzania",
            "Climbing",
            "Adventure",
            "Travel Planning",
          ],
        }),
      },
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Journal", path: "/journal" },
        { name: TITLE, path: ROUTE },
      ]),
      buildFAQJsonLd(FAQS),
    ],
  }),
  component: ArticlePage,
});

function TableOfContents() {
  const items = [
    { href: "#why-arusha", label: "Why spend a night in Arusha before your trek" },
    { href: "#good-accommodation", label: "What makes good Kilimanjaro accommodation" },
    { href: "#nature-prepares-you", label: "Why nature helps you prepare" },
    { href: "#after-the-summit", label: "Recovering after reaching the summit" },
    { href: "#why-mtoni", label: "Why choose Mtoni River Lodge" },
    { href: "#faq", label: "Frequently asked questions" },
  ];
  return (
    <nav
      aria-label="Table of contents"
      className="my-4 border-y border-charcoal/15 py-6 font-sans text-sm not-italic"
    >
      <p className="eyebrow text-charcoal/60">In this article</p>
      <ol className="mt-4 space-y-2 text-charcoal/80">
        {items.map((it, i) => (
          <li key={it.href} className="flex gap-3">
            <span className="tabular-nums text-charcoal/45">
              {String(i + 1).padStart(2, "0")}
            </span>
            <a href={it.href} className="hover:text-charcoal hover:underline">
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="June 2026 · 7 min read · Travel Guide"
      title={TITLE}
      intro="Where you rest in the days before a Kilimanjaro climb shapes how you start the mountain. A practical guide to choosing accommodation in Arusha — and why a quiet, riverfront lodge is often the wiser base."
      image={hero}
      imageAlt="Aerial view of Mtoni River Lodge in Arusha — a peaceful base for climbers preparing to summit Mount Kilimanjaro"
      caption="Mtoni River Lodge from above — Gomba Estate, Arusha"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          Climbing Mount Kilimanjaro is one of the most rewarding journeys a
          traveller can undertake in East Africa. It is also one of the most
          physically demanding. Long before the first day on the trail, the
          quality of your sleep, your meals, and the calm of your
          surroundings begin to shape how your body and mind arrive at the
          mountain. Choosing the right place to stay in Arusha is not a
          small detail — it is part of the climb itself.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p>
          This guide is written for climbers planning a Kilimanjaro
          expedition and trying to decide where to stay before — and after —
          the trek. It looks at why a night or two in Arusha matters, what
          to look for in good pre-climb accommodation, and how a peaceful,
          nature-led setting can support a stronger summit attempt.
        </p>
      </Reveal>

      <Reveal delay={120}>
        <TableOfContents />
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="why-arusha"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why spend a night in Arusha before your trek?
        </h2>
        <p>
          Most climbers arrive into Kilimanjaro International Airport (JRO)
          after long international flights. Stepping straight from the
          terminal onto the mountain the next morning is possible, but it
          rarely serves the climb. A night or two in Arusha gives the body
          and mind a chance to settle.
        </p>
        <p>
          The reasons to pause are practical as much as personal:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Recover from international flights.</strong> Long-haul
            travel leaves the body dehydrated and stiff — poor conditions
            for a six- to nine-day trek.
          </li>
          <li>
            <strong>Rest before climbing.</strong> A full night of
            uninterrupted sleep at lower altitude meaningfully improves how
            you feel on day one of the trail.
          </li>
          <li>
            <strong>Equipment checks.</strong> Your guide or operator will
            typically inspect your kit the day before departure. Layering,
            boots, sleeping bag and headlamp all need to be confirmed in
            daylight, with time to source anything missing.
          </li>
          <li>
            <strong>Meeting your guides.</strong> A calm pre-climb briefing
            with your lead guide builds trust and clarifies pace,
            communication, and emergency protocols.
          </li>
          <li>
            <strong>Weather and climate preparation.</strong> Arusha's
            climate gives you a first read on temperature, humidity and
            altitude before the mountain.
          </li>
          <li>
            <strong>Mental preparation.</strong> The summit is as much a
            psychological climb as a physical one. A quiet day to reset is
            often what separates a strong climb from a struggling one.
          </li>
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="good-accommodation"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          What makes good Kilimanjaro accommodation?
        </h2>
        <p>
          Not every hotel in Arusha is well suited to climbers. Busy city
          properties, late check-ins, and noisy surroundings all work
          against the rest you need. When you assess a property, look for:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Comfortable beds</strong> — firm enough to support a
            tired body and quiet enough to allow deep sleep.
          </li>
          <li>
            <strong>Peaceful surroundings</strong> — away from city traffic
            and constant movement, so the nervous system can settle.
          </li>
          <li>
            <strong>Fresh meals</strong> — wholesome, well-balanced food that
            fuels the climb rather than overloads the digestive system.
          </li>
          <li>
            <strong>Hot showers</strong> — especially important after the
            climb, when warm water is one of the simplest tools for
            recovery.
          </li>
          <li>
            <strong>Reliable Wi-Fi</strong> — to confirm flights, send
            messages home, and stay in touch with your operator.
          </li>
          <li>
            <strong>Easy transport links</strong> — close enough to both the
            airport and the trek operators to keep transfers short.
          </li>
          <li>
            <strong>Helpful, attentive hospitality</strong> — a team that
            understands climbers and can quietly handle early breakfasts,
            luggage storage and last-minute requests.
          </li>
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="nature-prepares-you"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why nature helps you prepare
        </h2>
        <p>
          There is a reason experienced climbers often choose a lodge over a
          city hotel before a Kilimanjaro trek. A quiet, natural environment
          slows the breath and lowers the body's background stress before
          one of Africa's most demanding adventures begins. The hours before
          a climb are best spent reading, walking gently, and sleeping well
          — not navigating traffic.
        </p>
        <p>
          This is part of why{" "}
          <Link to="/" className={linkCls}>
            Mtoni River Lodge
          </Link>{" "}
          has become a quiet favourite among climbers. Set on the banks of
          the Nduruma River in Gomba Estate, the property is built around
          gardens, water, and Maasai-inspired{" "}
          <Link to="/lodge" className={linkCls}>
            architecture
          </Link>{" "}
          that opens to the landscape rather than competes with it. The
          rooms are calm, the grounds are quiet, and the rhythm of the day
          encourages rest — exactly what the mountain asks for.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="after-the-summit"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Recovering after reaching the summit
        </h2>
        <p>
          The descent from Kilimanjaro is often underestimated. By the time
          climbers return to Arusha, the body is asking for warmth, real
          food, and a long, motionless night. Where you stay after the
          climb matters as much as where you stay before it.
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Recovery and rest.</strong> A full day with no schedule
            allows muscles, joints and lungs to recalibrate to lower
            altitude.
          </li>
          <li>
            <strong>Nutrition.</strong> Fresh vegetables, protein and slow
            carbohydrates help the body rebuild after several days of trail
            food.
          </li>
          <li>
            <strong>Deep sleep.</strong> Quiet rooms and dark skies make a
            real difference after sleeping at altitude.
          </li>
          <li>
            <strong>Hot showers and warmth.</strong> Simple, but
            transformative after the cold of summit night.
          </li>
          <li>
            <strong>Relaxation by the river.</strong> Time spent doing
            nothing — a chair, water, birdsong — is part of the recovery.
          </li>
        </ul>
        <p>
          Many of our guests continue from Mtoni straight into a safari,
          travelling on to the{" "}
          <Link to="/experiences" className={linkCls}>
            Serengeti, Ngorongoro Conservation Area, Tarangire and Lake
            Manyara
          </Link>{" "}
          and other Northern Circuit destinations. A night of recovery in
          Arusha before that next chapter is almost always worthwhile.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="why-mtoni"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why choose Mtoni River Lodge
        </h2>
        <p>
          Mtoni River Lodge sits in a quiet stretch of Gomba Estate, a
          short drive from Arusha town and within easy reach of Kilimanjaro
          International Airport. Climbers tend to choose us for a few
          consistent reasons:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            A riverfront setting on the Nduruma River, with water and
            birdsong rather than traffic.
          </li>
          <li>
            Maasai boma-inspired{" "}
            <Link to="/lodge" className={linkCls}>
              architecture
            </Link>{" "}
            that feels grounded in the landscape.
          </li>
          <li>
            Comfortable{" "}
            <Link to="/rooms" className={linkCls}>
              accommodation
            </Link>{" "}
            designed for genuine rest before and after the climb.
          </li>
          <li>
            Fresh, considered{" "}
            <Link to="/dining" className={linkCls}>
              dining
            </Link>{" "}
            with early-breakfast options for trail departures.
          </li>
          <li>
            Peaceful{" "}
            <Link to="/gallery" className={linkCls}>
              gardens and quiet seating areas
            </Link>{" "}
            for reading, stretching and slow mornings.
          </li>
          <li>
            A convenient Arusha location, balanced between the airport and
            the trek operators.
          </li>
          <li>
            Warm, attentive hospitality from a team who know what climbers
            need — and what they don't.
          </li>
        </ul>
        <p>
          For full route details, climber-focused services and frequently
          asked questions specific to the mountain, see our dedicated{" "}
          <Link
            to="/mount-kilimanjaro-accommodation-arusha"
            className={linkCls}
          >
            Mount Kilimanjaro accommodation guide
          </Link>
          .
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="faq"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Frequently asked questions
        </h2>
        <div className="space-y-6">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-display text-xl leading-snug text-charcoal">
                {f.q}
              </h3>
              <p className="mt-2">{f.a}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Start your Kilimanjaro journey rested and ready
        </h2>
        <p>
          The climb begins long before the first step onto the trail. A
          quiet night by the river, a careful meal, and a calm morning are
          not luxuries — they are part of how strong climbers arrive at the
          mountain. When you are ready, we would be glad to host you before
          and after your Kilimanjaro trek.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-4 not-italic">
          <Link
            to="/book"
            className="inline-flex items-center gap-3 bg-charcoal px-8 py-4 font-sans text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-charcoal/85"
          >
            Book Your Stay →
          </Link>
          <Link
            to="/rooms"
            className="inline-flex items-center gap-3 border border-charcoal px-8 py-4 font-sans text-[0.72rem] uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
          >
            Explore Our Rooms →
          </Link>
        </div>
        <p className="pt-2 text-sm not-italic text-charcoal/70">
          Questions before you book? Visit our{" "}
          <Link to="/contact" className={linkCls}>
            contact page
          </Link>{" "}
          or read more about{" "}
          <Link to="/lodge" className={linkCls}>
            the lodge
          </Link>
          .
        </p>
      </Reveal>
    </ArticleLayout>
  );
}