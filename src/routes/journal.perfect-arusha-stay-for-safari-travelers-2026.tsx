import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import { Link } from "@tanstack/react-router";
import hero from "@/assets/hero-cottage-exterior.jpg";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";

const TITLE =
  "Why Mtoni River Lodge Is the Perfect Arusha Stay for Safari Travelers in 2026";
const DESCRIPTION =
  "Discover why Mtoni River Lodge is the ideal accommodation in Arusha for safari travelers, Kilimanjaro climbers, and visitors seeking authentic Tanzanian hospitality.";
const URL = "https://mtoniriverlodge.com/journal/perfect-arusha-stay-for-safari-travelers-2026";

const RELATED = [
  { to: "/rooms/riverfront-deluxe", label: "Riverfront Deluxe Rooms", description: "The signature room for travellers arriving before or after safari." },
  { to: "/rooms/family-room", label: "Family Rooms at Mtoni", description: "Generous interiors for families travelling with children to Tanzania." },
  { to: "/experiences", label: "Experiences Around the Lodge", description: "Cultural walks, coffee mornings, and gentle day journeys near Arusha." },
  { to: "/journal/discovering-arusha-through-nature-and-authentic-hospitality", label: "Discovering Arusha Through Nature and Hospitality", description: "A deeper look at the landscape and rhythm that surrounds Mtoni." },
  { to: "/book", label: "Check Availability for 2026", description: "Reserve your pre- or post-safari nights along the Nduruma River." },
];

export const Route = createFileRoute(
  "/journal/perfect-arusha-stay-for-safari-travelers-2026",
)({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: hero },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: hero },
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
          image: hero,
          datePublished: "2026-06-12",
          dateModified: "2026-06-12",
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
        }),
      },
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Journal", path: "/journal" },
        { name: TITLE, path: "/journal/perfect-arusha-stay-for-safari-travelers-2026" },
      ]),
    ],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="June 2026 · 5 min read · Travel Guide"
      title={TITLE}
      intro="A peaceful retreat between Kilimanjaro International Airport and Arusha City — designed for safari travelers seeking comfort, nature, and authentic Tanzanian hospitality."
      image={hero}
      imageAlt="Maasai-inspired cottage exterior at Mtoni River Lodge surrounded by lush gardens near Arusha"
      caption="A quiet cottage at Mtoni River Lodge — photograph by the lodge"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          When planning a Tanzania safari, choosing the right place to stay
          before or after your adventure can make all the difference. Located
          in a tranquil natural setting between Kilimanjaro International
          Airport (KIA) and Arusha City, Mtoni River Lodge offers travelers a
          unique combination of convenience, comfort, and authentic Tanzanian
          hospitality.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p>
          Whether you are arriving for a Serengeti safari, preparing to climb
          Mount Kilimanjaro, or exploring Northern Tanzania's iconic
          attractions, Mtoni River Lodge provides a refreshing escape from
          the busy pace of travel.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Why travelers choose Mtoni River Lodge
        </h2>
        <p>
          Many visitors arriving in Tanzania are looking for more than just a
          room — they want an experience. Mtoni River Lodge is designed
          around nature, culture, and relaxation. Guests enjoy spacious{" "}
          <Link to="/rooms" className="underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal">
            accommodations
          </Link>{" "}
          inspired by traditional Maasai architecture, beautiful gardens and
          natural surroundings, a peaceful atmosphere away from city noise,
          and personalized service from a dedicated local team — with easy
          access to Kilimanjaro International Airport and Arusha National
          Park.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p>
          The lodge's unique design blends modern comfort with authentic
          Tanzanian character, creating memorable stays for both local and
          international travelers.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          An ideal safari stopover in Arusha
        </h2>
        <p>
          Arusha is known as the safari capital of Tanzania, serving as the
          gateway to world-famous destinations including Serengeti National
          Park, the Ngorongoro Conservation Area, Tarangire National Park,
          Lake Manyara National Park, and Arusha National Park.
        </p>
        <p>
          For many travelers, Mtoni River Lodge serves as the perfect first
          or final stop during their safari journey. Guests can rest,
          recharge, and enjoy nature before heading into the wilderness or
          returning home. Explore our{" "}
          <Link to="/experiences" className="underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal">
            experiences
          </Link>{" "}
          for ways to begin and end your journey gently.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Experience the beauty of Tanzania at a slower pace
        </h2>
        <p>
          One of the most appreciated aspects of staying at Mtoni River
          Lodge is the opportunity to slow down. Wake up to birdsong, enjoy
          coffee surrounded by lush greenery, unwind with a glass of wine by
          the fire, or simply relax while listening to the sounds of nature.
          The{" "}
          <Link to="/dining" className="underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal">
            dining experience
          </Link>{" "}
          mirrors that same rhythm — unhurried, considered, and rooted in
          place.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Convenient location near Kilimanjaro International Airport
        </h2>
        <p>
          Travel convenience is one of the key reasons guests choose Mtoni
          River Lodge. The lodge's strategic location allows travelers to
          reach Kilimanjaro International Airport with ease, access Arusha
          City for shopping and cultural experiences, connect quickly with
          safari operators, and enjoy a peaceful environment away from urban
          congestion. This balance of accessibility and tranquility makes the
          property an excellent choice for both leisure and business
          travelers.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Sustainable hospitality inspired by nature
        </h2>
        <p>
          Mtoni River Lodge embraces the natural beauty of Northern
          Tanzania. From its use of natural materials and indigenous design
          inspiration to its commitment to creating a harmonious guest
          experience, the lodge reflects the landscapes and cultures that
          make Tanzania extraordinary. Guests seeking authentic, sustainable,
          and meaningful travel experiences often find that Mtoni River
          Lodge exceeds expectations.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Book your stay at Mtoni River Lodge
        </h2>
        <p>
          As Tanzania's high travel season continues, accommodation demand
          in Arusha increases significantly. Travelers planning safaris,
          Kilimanjaro climbs, or cultural tours are encouraged to secure
          their stay early. Whether you are visiting for a single night or
          an extended adventure, Mtoni River Lodge offers the comfort,
          serenity, and hospitality needed to make your Tanzania journey
          unforgettable. Get in touch through our{" "}
          <Link to="/plan" className="underline decoration-charcoal/30 underline-offset-4 hover:decoration-charcoal">
            contact page
          </Link>{" "}
          to begin planning.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          Experience nature, comfort, and authentic Tanzanian hospitality at
          Mtoni River Lodge — your peaceful gateway to Northern Tanzania.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}