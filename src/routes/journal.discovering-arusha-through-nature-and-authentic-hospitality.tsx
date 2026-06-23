import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import hero from "@/assets/aerial-lodge.jpg";
import {
  absoluteUrl,
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
} from "@/lib/seo-schema";

const TITLE = "Discovering Arusha Through Nature and Authentic Hospitality";
const META_TITLE = "Discover Arusha: Nature & Authentic Hospitality";
const DESCRIPTION =
  "Discover Arusha through nature, culture, and authentic hospitality at Mtoni River Lodge — a peaceful retreat close to Tanzania's iconic attractions.";
const ROUTE_PATH =
  "/journal/discovering-arusha-through-nature-and-authentic-hospitality";
const PUBLISHED = "2026-06-01";

const RELATED = [
  { to: "/lodge", label: "About Mtoni River Lodge", description: "Our story, design philosophy, and the people behind the lodge." },
  { to: "/rooms", label: "The Rooms — 24 Riverfront Rooms", description: "Boma-inspired sanctuaries set low along the Nduruma River." },
  { to: "/experiences", label: "Curated Arusha Experiences", description: "Coffee mornings, guided walks, and journeys into the surrounding villages." },
  { to: "/journal/perfect-arusha-stay-for-safari-travelers-2026", label: "The Perfect Arusha Stay for Safari Travellers", description: "Why Mtoni is the natural pre- and post-safari base in Arusha." },
  { to: "/book", label: "Plan Your Visit to Mtoni", description: "Check availability and reserve a few quiet days by the river." },
];

export const Route = createFileRoute(
  "/journal/discovering-arusha-through-nature-and-authentic-hospitality",
)({
  head: () => ({
    meta: [
      { title: `${META_TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: absoluteUrl(hero) },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: absoluteUrl(hero) },
    ],
    links: [{ rel: "canonical", href: absoluteUrl(ROUTE_PATH) }],
    scripts: [
      buildArticleJsonLd({
        title: TITLE,
        description: DESCRIPTION,
        image: hero,
        routePath: ROUTE_PATH,
        datePublished: PUBLISHED,
      }),
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Journal", path: "/journal" },
        { name: TITLE, path: ROUTE_PATH },
      ]),
    ],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="June 2026 · 4 min read"
      title={TITLE}
      intro="As more travelers seek meaningful experiences over traditional tourism, Arusha continues to emerge as one of Tanzania's most rewarding destinations."
      image={hero}
      imageAlt="Aerial view of Mtoni River Lodge nestled in green surroundings near Arusha"
      caption="Mtoni River Lodge from above — photograph by the lodge"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          At{" "}
          <Link to="/" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">Mtoni River Lodge</Link>,
          guests are discovering a different way to experience the region —
          one that combines comfort, nature, culture, and genuine hospitality.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          A growing interest in slower travel
        </h2>
        <p>
          Over the past month, we have welcomed growing interest from
          travelers looking for a peaceful retreat while remaining close to
          Arusha's major attractions. Nestled among natural surroundings and
          inspired by local architectural traditions, Mtoni River Lodge
          offers a unique balance between relaxation and exploration across
          its{" "}
          <Link to="/rooms" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">riverfront accommodation in Arusha</Link>.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Close to Arusha's most loved experiences
        </h2>
        <p>
          Guests can enjoy easy access to{" "}
          <Link to="/experiences" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">curated cultural experiences in Arusha</Link>{" "}
          such as Lake Duluti canoeing, local market visits, cultural tours,
          and day trips to some of Tanzania's most celebrated natural
          wonders. After a day of adventure, the lodge provides a tranquil
          setting where visitors can reconnect with nature and unwind.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Authentic accommodation, meaningful moments
        </h2>
        <p>
          The increasing engagement we have seen from travelers on our
          digital platforms reflects a growing appreciation for authentic
          accommodation experiences in Tanzania. Visitors are searching for
          places that offer more than a room — they seek memorable moments,
          local connections, and a sense of place — often gathered around{" "}
          <Link to="/dining" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">our riverside dining experience</Link>.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          A stay built around nature and hospitality
        </h2>
        <p>
          At Mtoni River Lodge, every stay is designed around these values.
          Whether visiting Arusha for leisure, business, or as part of a
          larger Tanzanian journey, guests can experience comfort,
          personalized service, and the beauty of nature in one
          destination.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          If you are planning your next visit to Arusha, we invite you to
          discover why more travelers are choosing nature-inspired
          hospitality for their Tanzanian adventure —{" "}
          <Link to="/book" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">book your stay at Mtoni River Lodge</Link>{" "}
          or read more about{" "}
          <Link to="/journal/perfect-arusha-stay-for-safari-travelers-2026" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">why Mtoni is the perfect Arusha stay for safari travellers</Link>.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}