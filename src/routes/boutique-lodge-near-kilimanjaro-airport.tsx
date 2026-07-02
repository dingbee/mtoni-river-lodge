import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import hero from "@/assets/lodge-hero-aerial.jpg";
import { buildBreadcrumbJsonLd, absoluteUrl } from "@/lib/seo-schema";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";

const TITLE =
  "The Perfect Boutique Lodge Near Kilimanjaro Airport for Your Tanzania Safari";
const PAGE_TITLE =
  "Boutique Lodge Near Kilimanjaro Airport | Before & After Safari | Mtoni River Lodge";
const DESCRIPTION =
  "Looking for a peaceful boutique lodge near Kilimanjaro International Airport? Stay at Mtoni River Lodge before or after your safari or Mount Kilimanjaro adventure and experience authentic Tanzanian hospitality surrounded by nature.";
const ROUTE = "/boutique-lodge-near-kilimanjaro-airport";
const URL = absoluteUrl(ROUTE);
const HERO_URL = absoluteUrl(hero);
const PUBLISHED = "2026-07-02";

const FAQS: ReadonlyArray<FAQItem> = [
  {
    q: "How far is Mtoni River Lodge from Kilimanjaro International Airport?",
    a: "Mtoni River Lodge is a comfortable drive from Kilimanjaro International Airport (JRO) — close enough for a convenient transfer on arrival or departure, yet far enough to offer the peace of a nature-led riverside setting rather than the noise of an airport hotel. Our team can help arrange a private transfer to match your flight schedule.",
  },
  {
    q: "Why stay near Kilimanjaro Airport before a safari?",
    a: "A restful first night near Kilimanjaro International Airport helps you recover from long-haul travel, adjust to the climate, and meet your safari guide fresh and prepared. Starting your Northern Tanzania safari from a peaceful boutique lodge is one of the simplest ways to make the whole journey feel calmer and more rewarding.",
  },
  {
    q: "Where should I stay after a safari in Tanzania?",
    a: "After days on the road through the Serengeti, Ngorongoro or Tarangire, most travellers want a quiet, comfortable base to decompress before flying home. A boutique lodge near Kilimanjaro International Airport — with a hot shower, fresh meals and a garden to rest in — is often the ideal transition between safari and the flight back.",
  },
  {
    q: "Should I stay in Arusha before climbing Mount Kilimanjaro?",
    a: "Yes. Most climbers spend one or two nights in the Arusha region before their trek to recover from flights, complete equipment checks, meet their guides and rest at lower altitude. A peaceful lodge near Kilimanjaro International Airport gives you a stronger physical and mental start than a busy city hotel.",
  },
  {
    q: "Does Mtoni River Lodge provide airport transfers?",
    a: "We can help coordinate private airport transfers to and from Kilimanjaro International Airport (JRO), as well as connections to your safari operator or Kilimanjaro trek trail head. Please share your flight details when you book so we can plan the smoothest possible arrival.",
  },
  {
    q: "Why choose a boutique lodge instead of an airport hotel?",
    a: "Airport hotels offer proximity, but rarely the calm you need before or after an adventure through Northern Tanzania. A boutique lodge like Mtoni offers gardens, birdsong, personalised hospitality and Maasai-inspired design — a peaceful alternative that still gives you easy access to Kilimanjaro International Airport.",
  },
];

const RELATED = [
  {
    to: "/journal/where-to-stay-before-climbing-mount-kilimanjaro",
    label: "Where to Stay Before Climbing Mount Kilimanjaro",
    description: "A practical guide to choosing accommodation in Arusha before your trek.",
  },
  {
    to: "/journal/perfect-arusha-stay-for-safari-travelers-2026",
    label: "The Perfect Arusha Stay for Safari Travelers",
    description: "Why Mtoni is a chosen base for travellers heading into Northern Tanzania.",
  },
  {
    to: "/mount-kilimanjaro-accommodation-arusha",
    label: "Mount Kilimanjaro Accommodation in Arusha",
    description: "Our dedicated guide for climbers staying before and after the trek.",
  },
];

const linkCls =
  "underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal";

export const Route = createFileRoute("/boutique-lodge-near-kilimanjaro-airport")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "boutique lodge near Kilimanjaro Airport, lodge near Kilimanjaro Airport, accommodation near Kilimanjaro Airport, hotel near Kilimanjaro Airport, where to stay before safari Tanzania, where to stay after safari Tanzania, before Kilimanjaro climb accommodation, after Kilimanjaro climb accommodation, Arusha accommodation, boutique lodge Tanzania, luxury lodge in Arusha, Northern Tanzania safari, Kilimanjaro International Airport accommodation, Maasai-inspired lodge, riverside lodge, Mtoni River Lodge",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: HERO_URL },
      {
        property: "og:image:alt",
        content:
          "Aerial view of Mtoni River Lodge — a boutique lodge near Kilimanjaro International Airport",
      },
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
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          image: {
            "@type": "ImageObject",
            url: HERO_URL,
            caption:
              "Aerial view of Mtoni River Lodge — a boutique lodge near Kilimanjaro International Airport",
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
            "Boutique lodge near Kilimanjaro Airport",
            "Kilimanjaro International Airport",
            "Arusha accommodation",
            "Northern Tanzania safari",
            "Before safari",
            "After safari",
            "Kilimanjaro climb",
            "Mtoni River Lodge",
          ],
        }),
      },
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Boutique Lodge Near Kilimanjaro Airport", path: ROUTE },
      ]),
      buildFAQJsonLd(FAQS),
    ],
  }),
  component: ArticlePage,
});

function TableOfContents() {
  const items = [
    { href: "#first-night", label: "Why your first night in Tanzania matters" },
    { href: "#conveniently-located", label: "Conveniently located for Kilimanjaro Airport" },
    { href: "#before-safari", label: "The ideal base before your safari" },
    { href: "#after-safari", label: "Recover after safari in comfort" },
    { href: "#kilimanjaro", label: "Before and after climbing Kilimanjaro" },
    { href: "#design", label: "Authentic Tanzanian design" },
    { href: "#hospitality", label: "Hospitality that feels personal" },
    { href: "#why-mtoni", label: "Why guests choose Mtoni River Lodge" },
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

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
    >
      {children}
    </h2>
  );
}

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="July 2026 · 9 min read · Travel Guide"
      title={TITLE}
      intro="A peaceful boutique lodge with easy access to Kilimanjaro International Airport — the calm, authentic beginning and ending to your Northern Tanzania safari or Mount Kilimanjaro adventure."
      image={hero}
      imageAlt="Aerial view of Mtoni River Lodge — a boutique lodge conveniently located for Kilimanjaro International Airport"
      caption="Mtoni River Lodge from above — a riverside gateway to Northern Tanzania"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          There is a moment, just after your plane touches down at
          Kilimanjaro International Airport, when the air changes. It is
          softer, warmer, faintly scented with earth and rain. Somewhere
          beyond the runway, the silhouette of Kilimanjaro rises above the
          plains, and you begin to understand that one of Africa's greatest
          journeys is no longer a plan — it is already underway.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p>
          How that journey begins shapes how it is remembered. The first
          night in Tanzania sets the tone for everything that follows: the
          safari through the Serengeti, the climb up Kilimanjaro, the slow
          drive through Maasai country. At{" "}
          <Link to="/" className={linkCls}>
            Mtoni River Lodge
          </Link>{" "}
          — a boutique riverside retreat with easy access to Kilimanjaro
          International Airport — that first night becomes part of the
          adventure itself.
        </p>
      </Reveal>

      <Reveal delay={120}>
        <TableOfContents />
      </Reveal>

      <Reveal delay={80}>
        <H2 id="first-night">Why your first night in Tanzania matters</H2>
        <p>
          Long-haul travel leaves the body behind the mind. By the time you
          reach Kilimanjaro International Airport, you may have crossed
          several time zones, sat through two connecting flights and
          gathered gear that has not yet been fully unpacked. Stepping
          straight into a safari vehicle or onto the Kilimanjaro trail the
          following morning is possible — but it rarely serves the
          experience you have travelled so far for.
        </p>
        <p>
          A single restful night makes a measurable difference. It gives
          your body time to rehydrate, your circadian rhythm a chance to
          settle, and your equipment a moment to be checked in daylight. It
          also creates space for something quieter: the shift from
          traveller to guest, from arrival to presence. That is the
          difference between staying at another busy airport hotel and
          resting at a peaceful boutique lodge surrounded by gardens, river
          and birdsong.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="conveniently-located">
          A boutique lodge conveniently located for Kilimanjaro International Airport
        </H2>
        <p>
          Mtoni River Lodge sits on the banks of the Nduruma River in Gomba
          Estate, between Kilimanjaro International Airport and the town of
          Arusha. The location is deliberate: close enough for a
          comfortable transfer on arrival or departure, yet far enough from
          the airport road to feel like another world entirely.
        </p>
        <p>
          What a boutique lodge offers, an airport hotel cannot:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>Tranquil grounds shaped by the sound of the river.</li>
          <li>Established gardens and shaded seating for slow mornings.</li>
          <li>Birdsong at first light instead of departure announcements.</li>
          <li>An authentic Tanzanian atmosphere, not a generic transit lobby.</li>
          <li>Personalised hospitality from a small, attentive team.</li>
        </ul>
        <p>
          For travellers who value the arrival as much as the destination,
          Mtoni is a peaceful alternative to airport hotels — an ideal base
          before your flight, and a gentle re-entry after it.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="before-safari">The ideal base before your Northern Tanzania safari</H2>
        <p>
          Northern Tanzania holds one of the greatest concentrations of
          wildlife on earth. Most safaris begin within a few hours of
          Kilimanjaro International Airport, moving out towards:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Serengeti National Park</strong> — endless plains, the
            Great Migration and the wide theatre of Africa's most iconic
            wildlife.
          </li>
          <li>
            <strong>Ngorongoro Conservation Area</strong> — a caldera of
            forests, lakes and grasslands teeming with life.
          </li>
          <li>
            <strong>Tarangire National Park</strong> — ancient baobabs and
            some of the largest elephant herds in East Africa.
          </li>
          <li>
            <strong>Lake Manyara National Park</strong> — flamingo-lined
            shores and tree-climbing lions in a compact, rewarding park.
          </li>
          <li>
            <strong>Arusha National Park</strong> — Mount Meru, giraffes and
            crater lakes within reach of the lodge itself.
          </li>
        </ul>
        <p>
          Guests who spend their first night at Mtoni tend to arrive at
          their safari fresher, calmer and better prepared. A quiet dinner
          by the river, an early night in a comfortable bed, and a slow
          breakfast at sunrise are the small details that transform a good
          safari into a great one. Explore our{" "}
          <Link to="/experiences" className={linkCls}>
            recommended experiences
          </Link>{" "}
          for the days around your safari.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="after-safari">Recover after safari in comfort</H2>
        <p>
          After days on the road — dust from the plains, early mornings and
          long hours in the vehicle — the body asks for something simple: a
          hot shower, a real meal, and a soft bed in a quiet room. Mtoni
          River Lodge was built for this pause.
        </p>
        <p>
          Imagine returning to a{" "}
          <Link to="/rooms" className={linkCls}>
            riverfront room
          </Link>
          , unlacing your boots on the veranda, and stepping into hot water
          under an open sky. Later, fresh, thoughtfully prepared food in
          the{" "}
          <Link to="/dining" className={linkCls}>
            garden dining room
          </Link>
          , with the sound of the Nduruma River in the background. That
          night, you sleep the kind of sleep only silence can bring. In the
          morning, coffee is served slowly, the gardens are green, and
          there is nothing at all you need to do.
        </p>
        <p>
          This is the kind of recovery that lets you carry your safari home
          with you — not as exhaustion, but as memory.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="kilimanjaro">Before and after climbing Mount Kilimanjaro</H2>
        <p>
          Climbers know that the mountain begins long before the trail. The
          nights before your expedition are for rest, hydration, gear
          organisation and quiet mental preparation. Arriving directly from
          an international flight into a summit push is possible; arriving
          with a full night of deep sleep behind you is wiser.
        </p>
        <p>
          Mtoni is well practised at hosting Kilimanjaro climbers. Our team
          can coordinate early breakfasts, secure luggage storage while you
          are on the mountain, and calm, unhurried check-ins after long
          journeys. For a full climber-focused guide, see our dedicated{" "}
          <Link to="/mount-kilimanjaro-accommodation-arusha" className={linkCls}>
            Mount Kilimanjaro accommodation
          </Link>{" "}
          page and journal piece on{" "}
          <Link
            to="/journal/where-to-stay-before-climbing-mount-kilimanjaro"
            className={linkCls}
          >
            where to stay before climbing Kilimanjaro
          </Link>
          .
        </p>
        <p>
          After the summit, the descent is only the beginning of the
          recovery. Warm showers, laundered clothes, a quiet room and long,
          nourishing meals do more for tired legs than any spa treatment.
          There is also something meaningful about celebrating the climb in
          a place that feels rooted in the landscape you just walked
          through — a fire in the evening, stars overhead, and the river
          continuing on as it always has.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="design">Experience authentic Tanzanian design</H2>
        <p>
          Mtoni River Lodge was shaped in dialogue with the land it sits
          on. Inspired by traditional Maasai boma architecture, the rooms
          are built from natural river stones, local timbers and handcrafted
          finishes that carry the mark of the artisans who made them. Thick
          walls stay cool through the middle of the day; thatched roofs
          soften the sound of the rain. Nothing is imported that could be
          made nearby.
        </p>
        <p>
          The result is an environment that feels like Tanzania — not a
          replica of a European hotel with Tanzanian décor. Learn more about
          the{" "}
          <Link to="/lodge" className={linkCls}>
            story of the lodge
          </Link>{" "}
          and the community it was built with.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="hospitality">Hospitality that feels personal</H2>
        <p>
          A small lodge is measured by its people. Ours is a team that
          remembers how you take your coffee, that knows which room catches
          the morning light, and that quietly moves an umbrella onto your
          table before the sun does. Airport transfers, safari
          coordination, early breakfasts, laundry between the mountain and
          the plains — these are handled without ceremony and without
          fuss.
        </p>
        <p>
          If you have questions before your arrival, our{" "}
          <Link to="/contact" className={linkCls}>
            team is easy to reach
          </Link>{" "}
          — often in the same hour you write.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="why-mtoni">Why guests choose Mtoni River Lodge</H2>
        <ul className="ml-6 list-none space-y-2">
          <li>✓ Peaceful riverside setting on the Nduruma River</li>
          <li>✓ Boutique atmosphere with only a handful of rooms</li>
          <li>✓ Nature-inspired, Maasai boma architecture</li>
          <li>✓ Personalised hospitality from a small, attentive team</li>
          <li>✓ Comfortable, quiet rooms designed for deep rest</li>
          <li>✓ Fresh, thoughtfully prepared meals from local ingredients</li>
          <li>✓ Convenient access to Kilimanjaro International Airport (JRO)</li>
          <li>✓ The ideal base before your Northern Tanzania safari</li>
          <li>✓ A restful recovery after safari in comfort</li>
          <li>✓ A wise choice before your Mount Kilimanjaro climb</li>
          <li>✓ A warm welcome after reaching the summit</li>
          <li>✓ A calm gateway to Northern Tanzania</li>
        </ul>
        <p>
          You can preview the lodge through our{" "}
          <Link to="/gallery" className={linkCls}>
            photo gallery
          </Link>{" "}
          or read more{" "}
          <Link to="/about" className={linkCls}>
            about our story
          </Link>
          .
        </p>
      </Reveal>

      <Reveal delay={80}>
        <H2 id="faq">Frequently asked questions</H2>
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
          Begin and end your Tanzania journey beautifully
        </h2>
        <p>
          Tanzania is more than a safari. It is the light on the plains at
          dawn, the quiet of a river at dusk, the warmth of a welcome that
          feels genuinely for you. A boutique lodge near Kilimanjaro
          International Airport is not simply a place to sleep — it is where
          your journey settles into itself, both at the beginning and at
          the end.
        </p>
        <p>
          When you are ready, we would be honoured to host you before your
          safari, after your climb, or in the quiet nights on either side
          of your flight.
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
      </Reveal>
    </ArticleLayout>
  );
}