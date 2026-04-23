import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import coffee from "@/assets/coffee.jpg";

const TITLE = "A morning with the beekeepers of Gomba";
const DESCRIPTION =
  "In the highlands above the lodge, three generations tend the hives that flavour our breakfast honey.";

export const Route = createFileRoute("/journal/a-morning-with-the-beekeepers-of-gomba")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Mtoni River Lodge` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: coffee },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: coffee },
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
      image={coffee}
      imageAlt="Beekeeper tending wooden hives in the Gomba highlands"
      caption="Morning in the Gomba highlands — photograph by the lodge"
    >
      <Reveal>
        <p>
          The road to Gomba climbs slowly out of the valley, past banana
          groves and small shambas, until the air turns cool and the first
          hives appear — long wooden boxes lashed high into the branches of
          old miombo trees, where the bees prefer them.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          We are met at first light by Mzee Baraka, who has kept bees on
          this hillside for forty-one years. His grandson Yusuf walks beside
          him, carrying the smoker. His daughter Amina, who runs the
          cooperative now, follows with a small basket of comb cut the
          evening before. Three generations, one hillside, one slow craft.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          The taste of a place
        </h2>
        <p>
          The honey here is dark, almost amber, with a faint smokiness from
          the wild basil and the eucalyptus that line the ridge. It is the
          taste of this exact hillside, in this exact season — something no
          jar in a supermarket has ever managed. We serve it on warm bread
          at breakfast, and quietly, without much ceremony, beside the
          morning yoghurt.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p>
          Mzee Baraka does not weigh his harvests. He listens to the hives,
          he watches the flowers, and he takes only what the bees can spare.
          It is, he says, a conversation. The bees have been patient
          teachers.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          The honey on your breakfast tray began here, on this hillside, at
          first light, with three people who know every tree by name.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}