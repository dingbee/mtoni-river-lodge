import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import hero from "@/assets/lodge-hero-aerial.jpg";
import { absoluteUrl, buildBreadcrumbJsonLd } from "@/lib/seo-schema";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";

const TITLE =
  "Planning Your Tanzania Safari? Here's Why Your Stay in Arusha Matters More Than You Think";
const PAGE_TITLE =
  "Planning a Tanzania Safari? Where to Stay in Arusha | Mtoni River Lodge";
const DESCRIPTION =
  "Planning a safari in Tanzania? Discover why staying in Arusha before and after your safari makes your journey smoother, more comfortable, and more memorable. Explore expert travel tips from Mtoni River Lodge.";
const ROUTE = "/planning-your-tanzania-safari-where-to-stay-in-arusha";
const URL = absoluteUrl(ROUTE);
const HERO_URL = absoluteUrl(hero);
const PUBLISHED = "2026-07-13";

const FAQS: ReadonlyArray<FAQItem> = [
  {
    q: "Is Arusha better than Moshi for a Tanzania safari?",
    a: "Arusha is the recognised safari capital of Northern Tanzania. Nearly every operator, park permit office and safari transfer is based here, and the town is closer to the Serengeti, Ngorongoro Crater, Tarangire and Lake Manyara. Moshi is better suited to Mount Kilimanjaro climbs. For a safari-first trip, choose Arusha.",
  },
  {
    q: "How far is Kilimanjaro International Airport from Arusha?",
    a: "Kilimanjaro International Airport (JRO) sits roughly halfway between Arusha and Moshi. From the airport to central Arusha is around 45 to 55 kilometres, or approximately one hour by road. Mtoni River Lodge is on the Arusha side, about 35 minutes from the terminal.",
  },
  {
    q: "Should I book accommodation before my safari?",
    a: "Yes. During peak season, reputable Arusha lodges fill months in advance. Booking at least one night before your safari departure protects your itinerary from flight delays and gives you time to meet your guide, review the route and prepare your kit calmly.",
  },
  {
    q: "How early should I arrive in Arusha before a safari?",
    a: "Plan to arrive at least one full night before your safari begins. Two nights is better if you are travelling from Europe, North America or Asia — one night rarely offsets a long-haul flight. Arriving early protects the first game-drive day, which is otherwise spent recovering rather than watching wildlife.",
  },
  {
    q: "Can I leave luggage at the lodge while on safari?",
    a: "Yes. Most Arusha lodges, including Mtoni River Lodge, offer complimentary secure storage for luggage you do not need on safari. Travel with a soft duffel for the vehicle and leave hard-shell suitcases at the lodge until you return.",
  },
  {
    q: "What should I pack for a Tanzania safari?",
    a: "Neutral, layered clothing (khaki, olive, beige), a warm fleece for early game drives, a wide-brim hat, sunglasses, reef-safe sunscreen, insect repellent, binoculars, a headlamp, a refillable water bottle, and any prescription medication. Laundry is available at the lodge before and after the trip, so pack light.",
  },
  {
    q: "What currency should I bring to Tanzania?",
    a: "US dollars are widely accepted for park fees, tips and larger purchases — bring newer notes (series 2013 or later) in mixed denominations. Tanzanian shillings are useful for markets, small cafés and taxis. Cards are accepted at most lodges and larger restaurants.",
  },
  {
    q: "Do I need cash in Arusha?",
    a: "You should carry some cash — mainly for guide and driver tips, curio markets, and smaller village stops during safari. ATMs in central Arusha dispense shillings; foreign-exchange bureaus handle dollar and euro conversions.",
  },
  {
    q: "How many nights are enough in Arusha?",
    a: "One night before and one night after the safari is the minimum. Two nights before is ideal for long-haul travellers, and two nights after gives you real time to rest, do laundry, explore Arusha and celebrate the trip before flying home.",
  },
];

const RELATED = [
  {
    to: "/journal/perfect-arusha-stay-for-safari-travelers-2026",
    label: "The Perfect Arusha Stay for Safari Travellers",
    description:
      "Why Mtoni is the chosen base for travellers heading into Northern Tanzania.",
  },
  {
    to: "/journal/where-to-stay-before-climbing-mount-kilimanjaro",
    label: "Where to Stay Before Climbing Mount Kilimanjaro",
    description:
      "A practical guide to choosing accommodation in Arusha before your trek.",
  },
  {
    to: "/boutique-lodge-near-kilimanjaro-airport",
    label: "The Perfect Boutique Lodge Near Kilimanjaro Airport",
    description:
      "A calm, authentic beginning and ending to your Northern Tanzania journey.",
  },
];

const linkCls =
  "underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal";

export const Route = createFileRoute(
  "/planning-your-tanzania-safari-where-to-stay-in-arusha",
)({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "Tanzania safari planning, where to stay in Arusha, Arusha safari lodge, boutique lodge in Arusha, luxury lodge Tanzania, where to stay before safari, where to stay after safari, Northern Tanzania safari, Mtoni River Lodge, Serengeti safari, Ngorongoro safari, Tarangire National Park, Arusha National Park, Kilimanjaro International Airport accommodation",
      },
      { name: "author", content: "Mtoni River Lodge" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: HERO_URL },
      {
        property: "og:image:alt",
        content:
          "Aerial view of Mtoni River Lodge in Arusha — a peaceful base before a Tanzania safari",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "article:published_time", content: PUBLISHED },
      { property: "article:modified_time", content: PUBLISHED },
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
          "@type": "TravelGuide",
          headline: TITLE,
          name: TITLE,
          description: DESCRIPTION,
          image: {
            "@type": "ImageObject",
            url: HERO_URL,
            caption:
              "Aerial view of Mtoni River Lodge — a peaceful base before and after a Tanzania safari",
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
          about: [
            "Tanzania safari planning",
            "Arusha accommodation",
            "Northern Tanzania safari",
            "Serengeti",
            "Ngorongoro Crater",
            "Tarangire National Park",
          ],
          speakable: {
            "@type": "SpeakableSpecification",
            cssSelector: [".article-intro", "#faq", "#why-arusha"],
          },
        }),
      },
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Journal", path: "/journal" },
        { name: "Planning Your Tanzania Safari", path: ROUTE },
      ]),
      buildFAQJsonLd(FAQS),
    ],
  }),
  component: ArticlePage,
});

function TableOfContents() {
  const items = [
    { href: "#why-arusha", label: "Why Arusha is the gateway to Northern Tanzania" },
    { href: "#how-many-nights", label: "How many nights should you spend in Arusha" },
    { href: "#before-safari", label: "Why staying before your safari matters" },
    { href: "#after-safari", label: "Why staying after your safari is worth it" },
    { href: "#great-lodge", label: "What makes a great safari lodge" },
    { href: "#boutique-vs-hotel", label: "Boutique lodges vs large hotels" },
    { href: "#around-arusha", label: "What to do around Arusha" },
    { href: "#faq", label: "Frequently asked questions" },
    { href: "#why-mtoni", label: "Why Mtoni River Lodge is the ideal safari base" },
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
      eyebrow="July 2026 · 10 min read · Travel Guide"
      title={TITLE}
      intro="Where you begin — and end — a Tanzania safari shapes the whole journey. A practical, honest guide to why Arusha is the smart base, how many nights to plan, and what to look for in a lodge before you ride out to the parks."
      image={hero}
      imageAlt="Aerial view of Mtoni River Lodge in Arusha, a peaceful boutique base before and after a Tanzania safari"
      caption="Mtoni River Lodge from above — Gomba Estate, Arusha"
      relatedReading={RELATED}
    >
      <Reveal>
        <p className="article-intro">
          For most travellers, a Tanzania safari is a once-in-a-lifetime
          journey. Months of planning collapse into a handful of dawns on the
          plains, evenings around a fire, and long, dust-lit drives through
          country that still moves at the pace of animals. What almost every
          first-time visitor underestimates is how much the days before and
          after the safari shape the trip. And those days, whether you plan
          it or not, belong to Arusha.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p>
          This guide is written for travellers who are actively planning a
          safari in the Northern Circuit — the Serengeti, the Ngorongoro
          Crater, Tarangire, Lake Manyara and Arusha National Park — and are
          trying to decide where to stay when they land. It covers why
          Arusha matters, how many nights to allow, what to look for in a
          safari lodge, and the small, practical questions that most itineraries
          leave out.
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
          Why Arusha is the gateway to Northern Tanzania
        </h2>
        <p>
          Almost every Northern Tanzania safari begins in Arusha. The town
          sits at the base of Mount Meru, close to Kilimanjaro International
          Airport, and within a comfortable drive of every major park in the
          Northern Circuit. Safari operators, park permit offices, guide
          associations and vehicle workshops are all clustered here — which
          is why itineraries almost always route through it.
        </p>
        <p>
          From Arusha, the driving distances to the parks are honest and
          predictable:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li><strong>Arusha National Park</strong> — around 45 minutes.</li>
          <li><strong>Tarangire National Park</strong> — around 2 hours.</li>
          <li><strong>Lake Manyara National Park</strong> — around 2 hours.</li>
          <li><strong>Ngorongoro Conservation Area</strong> — around 3.5 hours.</li>
          <li><strong>Serengeti National Park</strong> — around 6 to 8 hours by road, or a short bush flight.</li>
        </ul>
        <p>
          Choosing to stay in Arusha is not a compromise on the safari — it
          is part of the safari. The town is where kit is gathered, plans
          are made, and travellers finally slow down after long flights.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="how-many-nights"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          How many nights should you spend in Arusha?
        </h2>
        <p>
          The honest answer: at least one night before your safari and one
          night after. For most travellers, two nights on either side is
          better. A single overnight rarely offsets a long-haul flight, and
          the first game-drive day is otherwise spent recovering in the
          vehicle rather than watching wildlife.
        </p>
        <p>Here is a simple planning table:</p>
        <div className="not-italic overflow-x-auto">
          <table className="w-full border-collapse text-left font-sans text-sm">
            <thead>
              <tr className="border-b border-charcoal/25">
                <th className="py-3 pr-4 font-medium text-charcoal">Traveller</th>
                <th className="py-3 pr-4 font-medium text-charcoal">Before safari</th>
                <th className="py-3 pr-4 font-medium text-charcoal">After safari</th>
              </tr>
            </thead>
            <tbody className="text-charcoal/80">
              <tr className="border-b border-charcoal/10">
                <td className="py-3 pr-4">Regional / East Africa</td>
                <td className="py-3 pr-4">1 night</td>
                <td className="py-3 pr-4">1 night</td>
              </tr>
              <tr className="border-b border-charcoal/10">
                <td className="py-3 pr-4">Europe / Middle East</td>
                <td className="py-3 pr-4">1–2 nights</td>
                <td className="py-3 pr-4">1–2 nights</td>
              </tr>
              <tr className="border-b border-charcoal/10">
                <td className="py-3 pr-4">North America / Asia</td>
                <td className="py-3 pr-4">2 nights</td>
                <td className="py-3 pr-4">2 nights</td>
              </tr>
              <tr>
                <td className="py-3 pr-4">Combining with Kilimanjaro</td>
                <td className="py-3 pr-4">2 nights</td>
                <td className="py-3 pr-4">2–3 nights</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="before-safari"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why staying before your safari makes a difference
        </h2>
        <p>
          The days before a safari are not empty days — they are working
          days. They protect the trip you have planned for months. In our
          experience, guests who arrive with a night to spare enjoy their
          first morning in the parks in a completely different way to those
          who came straight from the airport.
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Flight recovery.</strong> Long flights leave the body
            dehydrated, stiff and low on sleep. One quiet night resets more
            than any coffee ever will.
          </li>
          <li>
            <strong>Guide briefing.</strong> Most safari operators run a
            pre-departure briefing to review the route, timings and vehicle
            arrangements. Doing it rested is doing it well.
          </li>
          <li>
            <strong>Equipment preparation.</strong> Layers, camera batteries,
            binoculars, adapters, medication — all of it is easier to check
            in daylight, with time to fix anything missing.
          </li>
          <li>
            <strong>Relaxation.</strong> A safari is not a holiday of doing
            nothing. Starting rested means the first sightings register the
            way they should.
          </li>
          <li>
            <strong>Adjusting to the climate.</strong> Arusha sits at over
            1,400 metres. A day here gives the body a gentle first read on
            the altitude, temperature and light.
          </li>
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="after-safari"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why staying after your safari is worth it
        </h2>
        <p>
          The end of a safari is quieter than travellers expect. Days on the
          plains ask a lot of the body and even more of the senses. Trying
          to fly home the same afternoon you leave the Serengeti almost
          always feels rushed — and often means missing a flight if the
          bush transfer is delayed.
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Rest.</strong> A long, motionless night in a quiet room
            after days of dust and early starts.
          </li>
          <li>
            <strong>Laundry.</strong> Safari clothes come back dusty. Same-day
            or next-morning laundry sends you home with clean bags.
          </li>
          <li>
            <strong>Celebrating.</strong> A slow dinner, a proper glass of
            wine, and time to actually talk about what you saw.
          </li>
          <li>
            <strong>Shopping.</strong> Craft markets in Arusha are the best
            place to find Tanzanite, Makonde carvings, and Maasai beadwork
            without the safari-lodge markup.
          </li>
          <li>
            <strong>Local culture.</strong> Coffee farms, cultural walks and
            small village visits are usually skipped on the way in; the
            return leg is when they are enjoyed properly.
          </li>
          <li>
            <strong>Avoiding rushed departures.</strong> International
            flights out of JRO leave late in the evening. A buffer day
            protects the entire journey home.
          </li>
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="great-lodge"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          What makes a great safari lodge?
        </h2>
        <p>
          A good pre- and post-safari lodge is not measured in stars. It is
          measured in how well it lets you rest, prepare and recover. The
          questions worth asking of any Arusha property are simple:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>Is it quiet? Traffic noise and city bustle work against sleep.</li>
          <li>Is it close to both the airport and safari operators?</li>
          <li>Are the beds and rooms designed for deep rest?</li>
          <li>Is the food fresh, seasonal, and safe for sensitive stomachs?</li>
          <li>Can the team handle early breakfasts, luggage storage and transfers without friction?</li>
          <li>Does the environment feel like Tanzania — or like anywhere else?</li>
        </ul>
        <p>
          <Link to="/" className={linkCls}>Mtoni River Lodge</Link> was
          built around exactly these questions. The property sits on the
          banks of the Nduruma River in Gomba Estate — quiet, green, and
          away from the traffic of central Arusha. The{" "}
          <Link to="/rooms" className={linkCls}>rooms</Link> are
          Maasai-boma inspired and shaped for real sleep. The{" "}
          <Link to="/dining" className={linkCls}>kitchen</Link> works with
          local producers and prepares early breakfasts on request. Luggage
          storage, airport transfers and operator coordination are handled
          by a team who does this every week.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="boutique-vs-hotel"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why travellers choose boutique lodges instead of large hotels
        </h2>
        <p>
          Arusha has its share of large chain hotels. They work well for
          conferences and short overnight stopovers. For travellers here to
          experience Tanzania, a boutique lodge is usually the better
          answer.
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Personalised hospitality.</strong> The team learns your
            names, your flight times and how you take your coffee.
          </li>
          <li>
            <strong>Quieter surroundings.</strong> Gardens, rivers and
            birdsong instead of lobbies and lifts.
          </li>
          <li>
            <strong>Authentic experience.</strong> Local materials, local
            food, local design — a real sense of where you are.
          </li>
          <li>
            <strong>Better connection with culture.</strong> Boutique
            properties tend to work closely with Maasai communities, coffee
            farmers and craftspeople.
          </li>
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="around-arusha"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          What can you do around Arusha before or after safari?
        </h2>
        <p>
          There is more to do around Arusha than most itineraries suggest.
          If you have a day either side of your safari, spend it well:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Arusha National Park</strong> — a half-day drive through
            forest, lakes and Mount Meru foothills, often with giraffe,
            buffalo and flamingoes.
          </li>
          <li>
            <strong>Coffee farms</strong> — visits and tastings across Gomba
            and the slopes of Mount Meru.
          </li>
          <li>
            <strong>Local markets</strong> — Maasai Market and Central Market
            for spices, beadwork, textiles and everyday life.
          </li>
          <li>
            <strong>Cycling</strong> — quiet estate roads and river tracks,
            best in the cool of morning.
          </li>
          <li>
            <strong>Nature walks</strong> — guided walks along the Nduruma
            River and through neighbouring villages.
          </li>
          <li>
            <strong>Cultural experiences</strong> — meetings with Maasai
            elders, cooking with local families, and small community
            projects.
          </li>
          <li>
            <strong>Dining</strong> — long, slow lunches at the lodge or in
            a handful of quietly excellent restaurants around town.
          </li>
        </ul>
        <p>
          Many of these are offered directly through our{" "}
          <Link to="/experiences" className={linkCls}>
            Mtoni Experiences
          </Link>{" "}
          programme — small, unhurried and led by the people who live here.
          Photographs of the property and the surrounding landscape live in
          our <Link to="/gallery" className={linkCls}>gallery</Link>.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2
          id="faq"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Frequently asked questions before booking a safari
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
        <h2
          id="why-mtoni"
          className="pt-6 font-display text-3xl leading-tight text-charcoal scroll-mt-24"
        >
          Why Mtoni River Lodge is the ideal safari base
        </h2>
        <p>
          After hosting thousands of travellers arriving and departing from
          the parks, we have learnt what a good safari base actually
          requires. Mtoni River Lodge is designed around it:
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <strong>Peaceful gardens</strong> that let the nervous system
            settle after long-haul travel.
          </li>
          <li>
            <strong>A riverside setting</strong> on the Nduruma — water,
            birds, and shade.
          </li>
          <li>
            <strong>Boutique accommodation</strong> with genuinely quiet
            rooms and beds built for real sleep.
          </li>
          <li>
            <strong>Authentic architecture</strong> inspired by Maasai boma
            traditions and built with local materials.
          </li>
          <li>
            <strong>Excellent dining</strong> that uses seasonal produce and
            handles both early breakfasts and celebratory dinners with equal
            care.
          </li>
          <li>
            <strong>Airport convenience</strong> — a straightforward, safe
            transfer to and from Kilimanjaro International Airport.
          </li>
          <li>
            <strong>Warm hospitality</strong> from a team that has helped
            thousands of safari travellers arrive well and leave well.
          </li>
        </ul>
        <p>
          More about the property, the design and the philosophy behind it
          lives on our <Link to="/lodge" className={linkCls}>lodge page</Link>.
          If you have a specific question that is not answered here, our{" "}
          <Link to="/contact" className={linkCls}>contact page</Link> is the
          fastest way to reach us.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Book your stay
        </h2>
        <p>
          A safari in Tanzania is not something you rush into or out of.
          Give yourself a night on either side — arrive gently, leave well,
          and let the country do the rest. When you are ready, we would be
          honoured to host you before and after the parks.
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