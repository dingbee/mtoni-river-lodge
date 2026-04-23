import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import villa from "@/assets/villa-exterior.jpg";

const TITLE = "The architecture of disappearing";
const DESCRIPTION =
  "How the lodge was designed to vanish into the trees — and the local artisans who built it.";

export const Route = createFileRoute("/journal/the-architecture-of-disappearing")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: villa },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: villa },
    ],
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="December 2025 · 7 min read"
      title={TITLE}
      intro={DESCRIPTION}
      image={villa}
      imageAlt="Lodge villa half-hidden among riverside trees"
      caption="A villa among the figs — photograph by the lodge"
    >
      <Reveal>
        <p>
          The brief, when the lodge was first imagined, was almost a riddle:
          to build something that would not be seen. Not from the river, not
          from the opposite bank, not from the path that runs along the
          ridge. The trees were here first. They would stay first.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          The architects, a small studio from Arusha, spent the first month
          not drawing. They walked the land at dawn, at noon, at dusk. They
          marked the trees that could not be moved. They mapped the small
          clearings the elephants had already made for them. The plan, when
          it finally appeared, followed the land instead of correcting it.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Stone, thatch, the long grain of timber
        </h2>
        <p>
          The walls are local stone, cut from a quarry an hour upriver. The
          roofs are thatched in the old way, by a family from the
          neighbouring village who have done this work for four generations
          and prefer not to be hurried. The timber for the decks came from
          fallen mninga, gathered slowly over two seasons. Nothing was
          shipped in that could be made nearby.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          The colours were chosen, in the end, by holding swatches against
          the bark of the largest fig on site, and rejecting anything that
          shouted. What remained was the colour of shade, of damp earth,
          of the river when it slows.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          The disappearing act
        </h2>
        <p>
          From the river, on a quiet morning, you can pass the lodge
          without seeing it. A line of thatch, perhaps. A glint of glass
          between two trunks. Then the bend in the river takes you on, and
          it is gone. This, more than any award, is the measure we use.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          The best buildings, here, are the ones the forest forgets to
          notice.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}