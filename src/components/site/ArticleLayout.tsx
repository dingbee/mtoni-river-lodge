import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { WHATSAPP_URL } from "@/lib/contact";
import { trackBookingClick, trackWhatsAppClick } from "@/lib/analytics";

export type RelatedLink = {
  to: string;
  label: string;
  description?: string;
};

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  caption?: string;
  children: ReactNode;
  /** 3–5 contextual internal links rendered above the booking CTA. */
  relatedReading?: RelatedLink[];
};

export function ArticleLayout({ eyebrow, title, intro, image, imageAlt, caption, children, relatedReading }: Props) {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <article>
        <div className="px-6 pt-32 lg:px-12 lg:pt-40">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs variant="dark" />
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

        {relatedReading && relatedReading.length > 0 && (
          <section className="border-t border-border px-6 py-20 lg:px-12 lg:py-24">
            <div className="mx-auto max-w-3xl">
              <Reveal>
                <p className="eyebrow">Related Reading</p>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-4 font-display text-3xl leading-tight lg:text-4xl">
                  Continue exploring Mtoni
                </h2>
              </Reveal>
              <Reveal delay={220}>
                <ul className="mt-10 divide-y divide-border border-y border-border">
                  {relatedReading.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="group flex flex-col gap-2 py-6 transition-colors hover:text-[var(--gold)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                      >
                        <span className="font-display text-xl leading-snug sm:text-2xl">
                          {link.label}
                        </span>
                        {link.description && (
                          <span className="text-sm leading-relaxed text-charcoal/65 sm:max-w-sm sm:text-right">
                            {link.description}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </section>
        )}

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
                  onClick={() =>
                    trackBookingClick({
                      buttonText: "Check Availability",
                      location: "article_cta",
                      destinationUrl: "/book",
                    })
                  }
                  className="inline-flex items-center gap-3 bg-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-charcoal/85"
                >
                  Check Availability →
                </Link>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackWhatsAppClick({
                      buttonText: "WhatsApp",
                      location: "article_cta",
                      destinationUrl: WHATSAPP_URL,
                    })
                  }
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