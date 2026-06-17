import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { ArticleLayout } from "@/components/site/ArticleLayout";
import villa from "@/assets/boma-thatch-room.jpg";

const TITLE =
  "Maasai Boma Architecture: The Earth and Thatch Design Philosophy of Mtoni River Lodge";
const DESCRIPTION =
  "Earth, thatch, and circular spatial logic — how the rooms at Mtoni are grounded in a Maasai boma tradition shaped by climate, culture, and the Arusha landscape.";

const RELATED = [
  { to: "/lodge", label: "About Mtoni River Lodge", description: "How the lodge was designed to disappear into the riverbank." },
  { to: "/rooms", label: "The Boma-Inspired Rooms", description: "Tour the twelve riverfront suites shaped by this tradition." },
  { to: "/rooms/standard-river", label: "Standard River Rooms", description: "Compact earth-and-thatch sanctuaries closest to the water." },
  { to: "/journal/building-with-the-community", label: "Building With the Community", description: "On the craftspeople who shaped every wall, beam, and bead at Mtoni." },
  { to: "/journal/what-the-river-has-taught-us-about-time", label: "What the River Has Taught Us About Time", description: "A quieter companion piece on the rhythm the architecture serves." },
];

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
      eyebrow="December 2025 · 6 min read"
      title={TITLE}
      intro={DESCRIPTION}
      image={villa}
      imageAlt="Thatched earth-walled room nestled among banana palms and forest at Mtoni River Lodge"
      caption="Earth, thatch and garden — photograph by the lodge"
      relatedReading={RELATED}
    >
      <Reveal>
        <p>
          In the open landscapes of Arusha, Tanzania, architecture has never
          been separate from life. It has always been shaped by climate,
          culture, and necessity. At{" "}
          <Link to="/lodge" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">our luxury lodge in Arusha</Link>,
          this wisdom is not
          referenced as inspiration alone — it is actively built into every
          structure.
        </p>
        <p>
          The{" "}
          <Link to="/rooms" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">boma-inspired rooms at Mtoni</Link>{" "}
          are grounded in the Maasai boma architecture
          tradition, where earth and thatch are not aesthetic choices, but
          intelligent responses to environment, temperature, and community
          living. This is sustainable architecture in Tanzania, expressed
          through form, material, and spatial rhythm.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          The logic of earth and thatch construction
        </h2>
        <p>
          The rooms are constructed using natural earth and thatch —
          materials that belong to the land itself. This approach is rooted
          in centuries of traditional African building systems, where homes
          were designed to respond to heat, wind, and seasonal change without
          mechanical intervention.
        </p>
        <p>
          Earth walls naturally regulate indoor temperature, keeping
          interiors cool during the day and warm during cooler nights. Thatch
          roofing softens sunlight, allowing filtered light and ventilation
          to move through the space. Together, these materials create a
          living structure — one that breathes with its environment rather
          than resisting it.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Circular spatial design: the boma principle
        </h2>
        <p>
          At the heart of Maasai boma architecture is the circle. This
          circular logic is reflected in how space is organized and
          experienced at Mtoni River Lodge. Rather than rigid linear layouts,
          the design encourages flow, orientation, and openness.
        </p>
        <p>
          The circular form represents equality of space, natural movement
          between areas, a sense of enclosure without confinement, and a
          connection to communal living traditions. This spatial intelligence
          is not decorative — it is functional heritage architecture.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Climate intelligence in design
        </h2>
        <p>
          The use of earth and thatch is not symbolic. It is climatic
          intelligence refined over generations. In the context of eco lodge
          design in Arusha, these materials perform critical environmental
          functions: earth stabilizes internal temperatures naturally, thick
          walls reduce heat penetration, thatch roofs allow hot air to rise
          and escape, and natural ventilation reduces dependency on
          artificial cooling.
        </p>
        <p>
          This creates a low-impact, energy-efficient living environment that
          aligns with modern sustainability principles while remaining deeply
          traditional.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Cultural continuity through architecture
        </h2>
        <p>
          Mtoni River Lodge does not replicate Maasai boma design as a visual
          motif. Instead, it respects it as an architectural language. This
          means preserving spatial principles rather than just appearance,
          using materials that reflect local ecosystems, honoring indigenous
          construction logic, and maintaining harmony between structure and
          landscape. This continuity ensures that the lodge remains
          culturally grounded within its environment in Tanzania.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Minimal impact construction philosophy
        </h2>
        <p>
          One of the defining principles of Mtoni River Lodge is minimal
          environmental disruption. By using locally available materials such
          as earth, thatch, and timber, construction avoids unnecessary
          industrial processing and long-distance material transport — a
          philosophy shared with the people who shaped the lodge, as we
          describe in{" "}
          <Link to="/journal/building-with-the-community" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">our piece on building with the community</Link>.
        </p>
        <p>
          The result is a reduced environmental footprint, stronger
          integration with the surrounding landscape, and architecture that
          feels placed rather than imposed. The lodge becomes part of the
          terrain — not an interruption of it.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="pt-6 font-display text-3xl leading-tight text-charcoal">
          Living within the landscape
        </h2>
        <p>
          Set near the river ecosystem of Arusha, the{" "}
          <Link to="/rooms/standard-river" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">river-facing rooms</Link>{" "}
          exist in
          continuous dialogue with nature. The design does not dominate the
          environment but responds to it — light, wind, vegetation, and
          seasonal rhythm all influence how the space is experienced. This is
          not just accommodation. It is eco-luxury living in Tanzania, where
          architecture and nature are inseparable — best understood through{" "}
          <Link to="/experiences" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">our cultural experiences in Arusha</Link>.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <p className="pt-6 italic text-charcoal/70">
          Through earth, thatch, and circular spatial logic, the lodge offers
          more than shelter — it offers continuity with a way of building
          that has always belonged here.{" "}
          <Link to="/book" className="underline decoration-[var(--gold)] underline-offset-4 hover:text-[var(--gold)]">Book your stay at Mtoni River Lodge</Link>{" "}
          to experience these earth-and-thatch rooms in person.
        </p>
      </Reveal>
    </ArticleLayout>
  );
}