import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { WHATSAPP_URL } from "@/lib/contact";

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  caption?: string;
  children: ReactNode;
};

export function ArticleLayout({ eyebrow, title, intro, image, imageAlt, caption, children }: Props) {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <article>
        <div className="px-6 pt-32 lg:px-12 lg:pt-40">
          <div className="mx-auto max-w-3xl">
            <Link
              to="/journal"
              className="inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal/60 transition-colors hover:text-charcoal"
            >
              ← Back to Journal
            </Link>
          </div>
        </div>
        <header className="px-6 pt-10 pb-16 lg:px-12 lg:pt-14">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <p className="eyebrow">{eyebrow}</p>
            </Reveal>
            <Reveal delay={200}>
              <h1 className="mt-6 font-display text-4xl leading-[1.05] lg:text-6xl">{title}</h1>
            </Reveal>
            <Reveal delay={320}>
              <p className="mt-8 text-lg leading-[1.7] text-charcoal/70">{intro}</p>
            </Reveal>
          </div>
        </header>

        <Reveal>
          <figure className="px-6 lg:px-12">
            <div className="mx-auto aspect-[16/9] max-w-[1300px] overflow-hidden">
              <img src={image} alt={imageAlt} className="h-full w-full object-cover" />
            </div>
            {caption && (
              <figcaption className="mx-auto mt-4 max-w-3xl text-xs uppercase tracking-[0.22em] text-muted-foreground">
                {caption}
              </figcaption>
            )}
          </figure>
        </Reveal>

        <section className="px-6 py-24 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-3xl space-y-8 font-serif text-lg leading-[1.85] text-charcoal/85">
            {children}
          </div>
        </section>

        <section className="border-t border-border px-6 py-24 lg:px-12">
          <div className="mx-auto flex max-w-3xl flex-col items-start gap-6">
            <Reveal>
              <p className="eyebrow">Plan your stay</p>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="font-display text-3xl leading-tight lg:text-4xl">
                Find a few quiet days by the river.
              </h2>
            </Reveal>
            <Reveal delay={240}>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to="/book"
                  className="inline-flex items-center gap-3 bg-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-charcoal/85"
                >
                  Check Availability →
                </Link>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 border border-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
                >
                  WhatsApp →
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </article>
      <SiteFooter />
    </div>
  );
}