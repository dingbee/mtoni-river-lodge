import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import guide from "@/assets/maasai-by-river.jpg";

const TITLE = "Building With the Community";

const RELATED = [
  { to: "/lodge", label: "About Mtoni River Lodge", description: "The family and philosophy behind a community-rooted retreat." },
  { to: "/journal/the-architecture-of-disappearing", label: "Maasai Boma Architecture", description: "How local craft and circular form shaped every room at Mtoni." },
  { to: "/journal/life-along-the-nduruma-river", label: "Life Along the Nduruma River", description: "The farming traditions of the villages that surround the lodge." },
  { to: "/experiences", label: "Experiences With Our Neighbours", description: "Spend a morning with the people and crafts that shape this place." },
  { to: "/contact", label: "Contact the Lodge", description: "Speak with our team about community visits and custom journeys." },
];
const DESCRIPTION =
  "Employment, infrastructure, and shared growth at Mtoni River Lodge — how hospitality and community development flow together along the Nduruma River.";

export const Route = createFileRoute("/journal/building-with-the-community")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: guide },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: guide },
    ],
    links: [{ rel: "canonical", href: "https://mtoniriverlodge.com/journal/building-with-the-community" }],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="January 2026 · 6 min read"
      title={TITLE}
      intro="At the core of Mtoni River Lodge lies a principle that extends beyond hospitality: true luxury must be shared with its surroundings."
      image={guide}
      imageAlt="A Maasai elder in a red shuka standing at the edge of the Nduruma River"
      caption="A neighbour by the river — photograph by the lodge"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          Set within the river-fed landscapes of Arusha, Tanzania, Mtoni is
          not an isolated sanctuary. It is part of a living ecosystem where
          local communities, natural resources, and sustainable tourism are
          deeply interconnected. The lodge exists because of the land — and
          in return, it is committed to contributing meaningfully to the
          people who call this region home.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Local employment as a foundation of growth
        </h2>
        <p>
          One of the most direct ways Mtoni River Lodge contributes to the
          surrounding community is through local employment in Arusha
          hospitality and tourism. From construction to daily operations,
          priority is given to skilled and semi-skilled workers from nearby
          villages, including roles in hospitality and guest services,
          gardening and landscape maintenance, culinary support and farm
          integration, and construction and craftsmanship.
        </p>
        <p>
          By creating opportunities within the local workforce, the lodge
          helps strengthen economic stability while preserving cultural
          familiarity within its team. Employment at Mtoni is not just
          transactional — it is relational. It builds long-term skill
          development and fosters a shared sense of ownership in the lodge’s
          growth.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Infrastructure built through local collaboration
        </h2>
        <p>
          Beyond employment, Mtoni actively engages in community-based
          infrastructure development in Arusha. Construction methods
          prioritize local materials and local expertise. Earth, thatch,
          timber, and river stone are sourced within the region, ensuring
          that development remains rooted in the surrounding environment
          rather than imported systems.
        </p>
        <p>
          This approach supports local material suppliers and craftsmen,
          traditional construction knowledge systems, and sustainable
          building practices aligned with the land. The use of river stone
          in key structures such as the restaurant, reception, and
          administration house reflects not only design identity but also a
          commitment to local resource integration.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Shared ecosystems, shared benefits
        </h2>
        <p>
          The relationship between Mtoni and the surrounding community
          extends into the land itself. The same river system that supports
          local agriculture also nourishes the lodge’s green spaces,
          vegetable gardens, and banana groves. This shared reliance on the
          Nduruma River ecosystem creates a natural balance between
          hospitality and agriculture.
        </p>
        <p>
          Local farmers use traditional irrigation systems fed by river
          streams to cultivate their land, while the lodge integrates
          similar ecological principles into its own food production. The
          result is circular: communities cultivate the land, the river
          sustains both farms and lodge, the lodge sources fresh produce
          locally, and economic value returns to the community.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Sustainable tourism with local impact
        </h2>
        <p>
          As part of the growing eco-tourism sector in Tanzania, Mtoni is
          committed to ensuring that tourism becomes a force for local
          empowerment rather than extraction. This means prioritizing local
          hiring over external labor imports, supporting small-scale farmers
          through direct sourcing, investing in regionally available
          construction materials, and encouraging cultural continuity in
          design and operations.
        </p>
        <p>
          Sustainable tourism here is not an abstract idea — it is measured
          in livelihoods supported, skills developed, and ecosystems
          preserved.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          A shared future along the river
        </h2>
        <p>
          The river that flows through this landscape does not belong to
          the lodge alone. It belongs to the communities, the farms, the
          wildlife, and the generations that have lived alongside it. Mtoni
          exists within this shared system — one where hospitality and
          community development are not separate goals, but interconnected
          outcomes.
        </p>
        <p>
          Every structure built, every person employed, and every
          ingredient sourced reflects a single intention: to grow without
          displacing, and to host without disconnecting.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          Mtoni River Lodge is more than a destination. It is a participant
          in a larger story of community resilience, environmental balance,
          and shared progress — ensuring that growth along the river is
          experienced by everyone it touches.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}