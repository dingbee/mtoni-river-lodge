import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import guide from "@/assets/guide.jpg";

const TITLE = "Reading the sky over Mount Meru";
const DESCRIPTION =
  "Our head guide on weather, omens, and why the afternoon clouds always come at four.";

export const Route = createFileRoute("/journal/reading-the-sky-over-mount-meru")({
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
  }),
  component: ArticlePage,
});

function ArticlePage() {
  return (
    <ArticleLayout
      eyebrow="January 2026 · 5 min read"
      title={TITLE}
      intro={DESCRIPTION}
      image={guide}
      imageAlt="Head guide watching the sky above Mount Meru"
      caption="Late afternoon over Meru — photograph by the lodge"
    >
      <Reveal>
        <p>
          Joseph has been guiding on this land for twenty-three years. He
          can read the sky the way some people read a familiar book —
          knowing not only the chapter, but how it ends.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          The clouds, he says, will arrive at four. They almost always do.
          A thin, mother-of-pearl band first, gathering on the western
          shoulder of Meru, then a slow procession east. By half past four
          the light on the river turns the colour of weak tea. By five, if
          the rains are close, the first drops begin.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Omens, large and small
        </h2>
        <p>
          A fish eagle calling twice before dawn means a clear day. Termites
          flying after rain mean more rain is coming. The weaver birds, when
          they begin a new colony low in the acacia, are bracing for wind.
          None of this is written down. It is simply known, and passed on,
          one season at a time.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          Joseph does not check forecasts. He steps outside, looks at the
          ridge, listens for half a minute, and decides. He has been wrong,
          he admits, perhaps four times. But he remembers each one.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          The mountain keeps the weather. We just learn, slowly, to ask it
          the right questions.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}