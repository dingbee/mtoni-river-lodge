import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import ndurumaGrove from "@/assets/nduruma-banana-grove.jpg";

const TITLE =
  "Life Along the Nduruma River: Farming Traditions, Irrigation Streams, and the Green Heart of Mtoni River Lodge";
const DESCRIPTION =
  "Where the Nduruma River branches into quiet irrigation streams, ox-ploughed fields, banana groves, and river-fed gardens shape the green sanctuary around Mtoni.";

const RELATED = [
  { to: "/lodge", label: "About Mtoni River Lodge", description: "The philosophy and family story behind this riverfront sanctuary." },
  { to: "/dining", label: "Riverside Dining at Mtoni", description: "Seasonal menus drawn from the river-fed gardens described above." },
  { to: "/experiences", label: "Curated Experiences in Arusha", description: "Walk the irrigation streams and farming villages with our guides." },
  { to: "/journal/what-the-river-has-taught-us-about-time", label: "What the River Has Taught Us About Time", description: "Reflections on the slow rhythm of the Nduruma." },
  { to: "/journal/building-with-the-community", label: "Building With the Community", description: "On the neighbours who shape life along the river." },
];

export const Route = createFileRoute("/journal/life-along-the-nduruma-river")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: ndurumaGrove },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ndurumaGrove },
    ],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="February 2026 · 4 min read"
      title={TITLE}
      intro={DESCRIPTION}
      image={ndurumaGrove}
      imageAlt="A banana grove laden with green fruit beside the Nduruma River gardens at Mtoni"
      caption="Banana groves along the Nduruma — photograph by the lodge"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          Along the lower slopes where the Nduruma River begins to branch
          into quiet, flowing streams, life unfolds at a rhythm shaped long
          before modern infrastructure arrived. This is the landscape where
          Mtoni River Lodge is rooted — a place defined not just by its
          architecture, but by the agricultural heartbeat of its surrounding
          community.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          A living farming heritage along the river
        </h2>
        <p>
          In the villages surrounding Mtoni, small-scale farming in Arusha
          remains deeply connected to water drawn from natural irrigation
          channels fed by the Nduruma River. These streams are not engineered
          in modern complexity — they follow inherited paths carved over
          generations, guiding water gently into cultivated fields.
        </p>
        <p>
          Here, farming is still guided by traditional agricultural practices.
          Before planting begins, farmers prepare the land using oxen, turning
          the soil in slow, deliberate motion. It is a method that reflects
          patience rather than speed, tradition rather than efficiency. Seeds
          are sown into earth that has been worked by hand, hoof, and time
          itself. This rhythm is not a memory of the past — it is the present
          reality of the land.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Oxen, soil, and seasonal wisdom
        </h2>
        <p>
          The use of oxen for ploughing remains a defining feature of
          subsistence farming in rural Tanzania. It is a practice that
          connects families to ancestral knowledge systems, where land
          preparation follows seasonal cues rather than mechanical schedules.
          Farmers read the land through experience — knowing when the soil is
          ready, when the rains will sustain growth, and when the river-fed
          streams are strong enough to nourish young crops. This relationship
          between people and land creates a farming system that is both
          fragile and enduring — shaped by respect rather than control.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          The river that sustains Mtoni
        </h2>
        <p>
          At Mtoni River Lodge, this same water system becomes part of daily
          life. The lodge benefits directly from the Nduruma River ecosystem
          and its irrigation streams, which nourish its surrounding greenery.
          The result is a naturally thriving environment where vegetation
          grows without artificial intensity — guided instead by consistent
          flow and fertile soil. Within the grounds, fresh vegetables are
          cultivated for seasonal cuisine, banana trees grow in abundance,
          and indigenous plants flourish in harmony with the river-fed soil.
          It is, quietly, an authentic farm-to-table experience in Arusha.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          A landscape defined by green continuity
        </h2>
        <p>
          The presence of the river system transforms the entire environment
          into a naturally green sanctuary. Unlike arid or controlled
          landscapes, this region carries a softness — a continuous layer of
          vegetation shaped by water movement rather than design intervention.
          It is this river effect that gives Mtoni its character: lush
          surroundings throughout the seasons, natural shade and cooling from
          riparian vegetation, and a sense of immersion in a living landscape
          rather than constructed scenery. This is not landscaping. It is
          ecology at work.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Where community and sanctuary meet
        </h2>
        <p>
          Mtoni River Lodge exists within a shared ecosystem — one where
          local farming traditions, river systems, and hospitality intersect
          naturally. The lodge does not stand apart from the land. It
          participates in it. From the ox-ploughed fields of nearby farmers
          to the banana groves within the lodge grounds, the connection is
          continuous. Water flows through fields, through gardens, through
          kitchens — linking community life and guest experience in one
          uninterrupted system.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          The Nduruma River does more than sustain agriculture. It sustains a
          way of life — visible in every green surface, every cultivated
          garden, and every plate served with ingredients grown nearby.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}