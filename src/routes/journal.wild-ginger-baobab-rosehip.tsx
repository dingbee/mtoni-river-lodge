import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import spa from "@/assets/spa.jpg";

const TITLE = "Wild ginger, baobab, rosehip";
const DESCRIPTION =
  "A short note on the East African botanicals at the heart of our spa.";

export const Route = createFileRoute("/journal/wild-ginger-baobab-rosehip")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: spa },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: spa },
    ],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="November 2025 · 3 min read"
      title={TITLE}
      intro={DESCRIPTION}
      image={spa}
      imageAlt="Spa treatment table with East African botanicals"
      caption="Botanicals from the surrounding land — photograph by the lodge"
    >
      <Reveal>
        <p>
          The spa, like the kitchen, begins outside. Most of what we use is
          gathered within an hour of the lodge — wild ginger from the damp
          shade beside the river, baobab pulp from the great trees on the
          plain, rosehip from a small grove our grower keeps near her house.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          Wild ginger warms the skin and wakes the senses; we steep it in
          oil for the massages that follow long days. Baobab is rich in
          everything the sun takes back from us — vitamin C, slow fats,
          gentle minerals. Rosehip carries the quiet work of repair.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Made the same week it is used
        </h2>
        <p>
          Nothing on our shelves is older than a season. The blends are
          mixed in small batches by hand, in the back of the spa pavilion,
          and labelled with the date and the moon they were made under.
          They do not need to last a year. They only need to last until the
          next gathering.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          The land carries its own pharmacy. We are simply careful
          translators.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}