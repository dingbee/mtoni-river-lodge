import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import hero from "@/assets/aerial-lodge.jpg";

const TITLE =
  "Discover Mtoni River Lodge: A Hidden Nature Retreat in Arusha, Tanzania";
const META_TITLE =
  "Mtoni River Lodge Arusha | Boutique Nature Retreat & Luxury Accommodation";
const DESCRIPTION =
  "Experience authentic Maasai-inspired hospitality at Mtoni River Lodge in Arusha. Stay surrounded by nature, explore Tanzania's iconic attractions, and enjoy personalized luxury.";
const URL =
  "https://mtoniriverlodge.com/journal/discover-mtoni-river-lodge-arusha";
const IMAGE_URL = `https://mtoniriverlodge.com${hero}`;

const RELATED = [
  { to: "/rooms", label: "Explore Our Rooms", description: "Maasai-inspired cottages and riverfront suites set within the lodge gardens." },
  { to: "/experiences", label: "Discover Our Experiences", description: "Cultural walks, coffee mornings, and gentle journeys around Arusha." },
  { to: "/gallery", label: "View the Gallery", description: "A visual journey through Mtoni — architecture, gardens, river, and light." },
  { to: "/about-us", label: "Learn More About Mtoni", description: "Our story, our people, and the philosophy that shapes the lodge." },
  { to: "/contact", label: "Contact Our Team", description: "Plan transfers, excursions, and tailored stays with our hosts." },
];

const FAQ = [
  {
    q: "Where is Mtoni River Lodge located?",
    a: "Mtoni River Lodge sits on the tranquil banks of the Nduruma River in Arusha, Tanzania — between Kilimanjaro International Airport and Arusha City, a convenient base for Northern Tanzania safaris.",
  },
  {
    q: "What makes Mtoni River Lodge a boutique lodge in Arusha?",
    a: "Mtoni is intentionally small in scale, designed around Maasai Boma-inspired architecture, natural materials, and personalised hospitality — every stay is tailored to the guest rather than standardised.",
  },
  {
    q: "Is Mtoni River Lodge a good base for safaris in Tanzania?",
    a: "Yes. From the lodge guests can easily reach Arusha National Park, Mount Meru, Serengeti, the Ngorongoro Conservation Area, Tarangire, and Lake Manyara — making it an ideal pre- or post-safari retreat.",
  },
  {
    q: "Does the lodge offer dining on-site?",
    a: "Yes. Mtoni serves fresh, seasonal meals inspired by local Tanzanian and international flavours, from early safari breakfasts to garden lunches and dinners beneath the stars.",
  },
  {
    q: "How do I book a stay at Mtoni River Lodge?",
    a: "You can check availability and book directly through our booking page, or contact our team for tailored arrangements, transfers, and excursion planning.",
  },
];

export const Route = createFileRoute(
  "/journal/discover-mtoni-river-lodge-arusha",
)({
  head: () => ({
    meta: [
      { title: META_TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: IMAGE_URL },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE_URL },
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
          image: IMAGE_URL,
          datePublished: "2026-06-21",
          dateModified: "2026-06-21",
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
          keywords: [
            "Mtoni River Lodge",
            "Arusha lodge",
            "Luxury lodge in Arusha",
            "Boutique lodge Tanzania",
            "Nature retreat Arusha",
            "Maasai-inspired accommodation",
            "Accommodation near Arusha National Park",
            "Tanzania safari lodge",
            "Where to stay in Arusha",
            "Best lodge in Arusha",
          ].join(", "),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://mtoniriverlodge.com/" },
            { "@type": "ListItem", position: 2, name: "Journal", item: "https://mtoniriverlodge.com/journal" },
            { "@type": "ListItem", position: 3, name: TITLE, item: URL },
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: ArticlePage,
});

const linkCls =
  "underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal";

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="June 2026 · 6 min read · Lodge Guide"
      title={TITLE}
      intro="Nestled along tranquil riverbanks in Arusha, Mtoni River Lodge offers an exceptional blend of nature, culture, comfort, and authentic Tanzanian hospitality."
      image={hero}
      imageAlt="Aerial view of Mtoni River Lodge — a boutique nature retreat in Arusha, Tanzania"
      caption="Mtoni River Lodge from above — a hidden retreat on the Nduruma River"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          Nestled along tranquil riverbanks in Arusha, Mtoni River Lodge offers
          an exceptional blend of nature, culture, comfort, and authentic
          Tanzanian hospitality. Designed to immerse guests in the beauty of
          Northern Tanzania while providing modern comforts, Mtoni is more
          than accommodation — it is a destination where meaningful
          experiences begin.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p>
          Whether you are arriving for a safari adventure, a romantic escape,
          a family holiday, or a peaceful retreat surrounded by nature, Mtoni
          River Lodge provides a unique setting that captures the spirit of
          Tanzania. You can{" "}
          <Link to="/about-us" className={linkCls}>learn more about Mtoni</Link>{" "}
          and the philosophy behind the lodge.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Experience authentic Maasai-inspired architecture
        </h2>
        <p>
          One of the most distinctive features of Mtoni River Lodge is its
          architecture, inspired by traditional Maasai Boma design. Carefully
          crafted structures incorporate natural materials, river stones, and
          locally influenced aesthetics that celebrate Tanzania's rich
          cultural heritage.
        </p>
        <p>
          Unlike conventional hotels, every space at Mtoni is thoughtfully
          designed to create a connection between guests and the surrounding
          landscape. The result is an atmosphere that feels both luxurious
          and deeply rooted in local tradition. You can{" "}
          <Link to="/gallery" className={linkCls}>view the gallery</Link>{" "}
          for a closer look at the lodge.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          A peaceful escape surrounded by nature
        </h2>
        <p>
          Located within lush natural surroundings, Mtoni River Lodge offers
          guests an opportunity to disconnect from busy schedules and
          reconnect with nature. Wake up to birdsong, enjoy peaceful
          riverside views, unwind in beautifully landscaped gardens, and
          experience a slower pace that encourages relaxation and reflection.
        </p>
        <p>The property's natural setting makes it ideal for travelers seeking:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>A quiet retreat in Arusha</li>
          <li>A boutique lodge experience</li>
          <li>A nature-inspired getaway</li>
          <li>A convenient base for Northern Tanzania adventures</li>
        </ul>
        <p>
          You can{" "}
          <Link to="/rooms" className={linkCls}>explore our rooms</Link>{" "}
          to find the space that fits your stay.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          The perfect base for Northern Tanzania adventures
        </h2>
        <p>
          Arusha serves as the gateway to some of Africa's most iconic
          destinations. From Mtoni River Lodge, guests can easily access:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Arusha National Park</li>
          <li>Mount Meru</li>
          <li>Serengeti National Park</li>
          <li>Ngorongoro Conservation Area</li>
          <li>Tarangire National Park</li>
          <li>Lake Manyara National Park</li>
        </ul>
        <p>
          Whether planning a safari, cultural excursion, hiking adventure, or
          day trip, Mtoni provides a comfortable and strategic base. Browse{" "}
          <Link to="/experiences" className={linkCls}>our experiences</Link>{" "}
          for ways to begin your journey.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Exceptional hospitality that feels personal
        </h2>
        <p>
          At Mtoni River Lodge, hospitality goes beyond service. Our team is
          dedicated to creating memorable guest experiences through
          personalized attention, thoughtful details, warm welcomes, and
          genuine care.
        </p>
        <p>
          From airport transfers and excursion planning to special
          celebrations and tailored guest experiences, every stay is designed
          to feel effortless and memorable. You can{" "}
          <Link to="/contact" className={linkCls}>contact our team</Link>{" "}
          to begin shaping your visit.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Fresh dining inspired by local flavors
        </h2>
        <p>
          Dining is an important part of the Mtoni experience. Guests enjoy
          carefully prepared meals featuring fresh ingredients and flavors
          inspired by both local and international cuisine.
        </p>
        <p>
          Whether enjoying breakfast before a safari departure, lunch in the
          gardens, or dinner beneath the stars, every meal complements the
          natural surroundings and relaxed atmosphere of the lodge.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Why choose Mtoni River Lodge?
        </h2>
        <p>Mtoni River Lodge combines:</p>
        <ul className="list-none space-y-2 pl-0">
          <li>✓ Authentic Maasai-inspired architecture</li>
          <li>✓ Beautiful natural surroundings</li>
          <li>✓ Personalized hospitality</li>
          <li>✓ Comfortable and elegant accommodation</li>
          <li>✓ Easy access to safari destinations</li>
          <li>✓ Memorable dining experiences</li>
          <li>✓ Peaceful riverside atmosphere</li>
          <li>✓ Genuine Tanzanian warmth</li>
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Book your stay at Mtoni River Lodge
        </h2>
        <p>
          Whether you are beginning your Tanzanian safari, exploring Arusha,
          or searching for a peaceful nature retreat, Mtoni River Lodge
          offers a distinctive experience where culture, comfort, and nature
          come together. Start planning your stay and discover why guests
          choose Mtoni as their home in Northern Tanzania —{" "}
          <Link to="/book" className={linkCls}>book your stay</Link> today.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Frequently asked questions
        </h2>
        <dl className="space-y-6">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="font-display text-xl text-charcoal">{f.q}</dt>
              <dd className="mt-2 text-charcoal/80">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </ArticleLayout>
  );
}