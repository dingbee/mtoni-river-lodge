import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PageHero } from "@/components/site/PageHero";
import { Reveal } from "@/components/site/Reveal";
import { Lightbox } from "@/components/site/Lightbox";
import { GALLERY, GALLERY_CATEGORIES, type GalleryCategory } from "@/lib/gallery";
import heroImg from "@/assets/aerial-lodge.jpg";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Mtoni River Lodge" },
      { name: "description", content: "An immersive gallery of Mtoni River Lodge — architecture, rooms, dining, nature, and quiet rituals along the Nduruma River in Arusha, Tanzania." },
      { property: "og:title", content: "Gallery — Mtoni River Lodge" },
      { property: "og:description", content: "Architecture, rooms, dining, and nature at Mtoni River Lodge." },
      { property: "og:image", content: heroImg },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroImg },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const [filter, setFilter] = useState<"All" | GalleryCategory>("All");
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);

  const items = useMemo(
    () => (filter === "All" ? GALLERY : GALLERY.filter((g) => g.category === filter)),
    [filter],
  );

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      <PageHero
        image={heroImg}
        imageAlt="Aerial view of Mtoni River Lodge along the Nduruma River"
        eyebrow="Gallery"
        title={<>A quiet portrait<br />of the lodge.</>}
        subtitle="Architecture, rooms, dining, and nature — captured in the slow light of the riverbank."
      />

      {/* Filters */}
      <section className="border-b border-border/60 px-6 lg:px-12">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 py-5 sm:gap-3">
          {GALLERY_CATEGORIES.map((c) => {
            const active = filter === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={`inline-flex items-center border px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.28em] transition-colors ${
                  active
                    ? "border-charcoal bg-charcoal text-ivory"
                    : "border-charcoal/25 text-charcoal/70 hover:border-charcoal hover:text-charcoal"
                }`}
              >
                {c}
              </button>
            );
          })}
          <span className="ml-auto text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/45">
            {items.length} images
          </span>
        </div>
      </section>

      {/* Masonry grid (CSS columns) */}
      <section className="px-4 py-12 sm:px-6 lg:px-12 lg:py-20">
        <div
          className="mx-auto max-w-[1500px] [column-gap:1rem] sm:[column-gap:1.25rem] [column-count:2] md:[column-count:3] lg:[column-count:4]"
        >
          {items.map((g, i) => (
            <Reveal key={`${g.src}-${i}`} variant="fade" delay={Math.min(i * 25, 250)} threshold={0.05}>
              <button
                type="button"
                onClick={() => { setStartIndex(i); setOpen(true); }}
                className="group mb-4 block w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 sm:mb-5"
                aria-label={`Open image: ${g.alt}`}
              >
                <img
                  src={g.src}
                  alt={g.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
                  style={{ display: "block" }}
                />
                <span className="mt-2 block text-left text-[0.6rem] uppercase tracking-[0.28em] text-charcoal/45">
                  {g.category}
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      <Lightbox
        images={items}
        startIndex={startIndex}
        open={open}
        onClose={() => setOpen(false)}
      />

      <SiteFooter />
    </div>
  );
}