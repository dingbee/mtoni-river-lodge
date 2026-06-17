import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";

type Align = "left" | "center";

type CTA = {
  label: string;
  to?: string;
  href?: string;
};

type Props = {
  image: string;
  imageAlt: string;
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: Align;
  cta?: CTA;
  back?: { to: string; label: string };
  /** Optional override for object-position on the image */
  imagePosition?: string;
  /** Optional floating price card overlay (used on room pages) */
  priceCard?: {
    eyebrow?: string;
    name: string;
    price: string;
    unit?: string;
    note?: string;
    cta?: { label: string; to: string };
  };
};

/**
 * Unified hero section used across all primary pages.
 *
 * Design system:
 *  - Height: 75vh mobile, 85vh desktop (never full 100vh on mobile)
 *  - Top safe spacing: 110px mobile / 140px desktop (clears the fixed header)
 *  - Content max-width: ~640px (left) / ~700px (center)
 *  - Gradient: dark top (header readability) + dark bottom (text contrast),
 *    transparent middle
 *  - Single primary CTA (optional)
 *  - 80px bottom margin to next section
 */
export function PageHero({
  image,
  imageAlt,
  eyebrow,
  title,
  subtitle,
  align = "left",
  cta,
  back,
  imagePosition,
  priceCard,
}: Props) {
  const isCenter = align === "center";
  return (
    <section className="relative mb-20 h-[75svh] min-h-[520px] w-full overflow-hidden lg:h-[85svh] lg:min-h-[640px]">
      <img
        src={image}
        alt={imageAlt}
        className="ken-burns absolute inset-0 h-full w-full object-cover"
        style={imagePosition ? { objectPosition: imagePosition } : undefined}
        width={1920}
        height={1080}
      />
      {/* Unified hero overlay — stronger top/bottom, brand-aligned dark green/black */}
      <div className="hero-overlay pointer-events-none absolute inset-0" />

      <div
        className={`relative z-10 mx-auto flex h-full max-w-[1300px] flex-col px-6 pb-16 pt-[110px] text-ivory lg:px-12 lg:pb-20 lg:pt-[140px] ${
          isCenter ? "items-center justify-end text-center" : "items-start justify-end"
        }`}
      >
        {back && (
          <Reveal>
            <Link
              to={back.to}
              className="eyebrow mb-6 inline-flex items-center gap-2 !text-ivory/70 transition-opacity hover:!text-ivory"
            >
              ← {back.label}
            </Link>
          </Reveal>
        )}
        <Reveal>
          <Breadcrumbs variant="light" className="mb-4" />
        </Reveal>
        {eyebrow && (
          <Reveal>
            <p className="eyebrow hero-text-shadow !text-ivory/85">{eyebrow}</p>
          </Reveal>
        )}
        <Reveal delay={150}>
          <h1
            className={`hero-text-shadow mt-5 font-display text-[2.5rem] leading-[1.05] text-ivory sm:text-5xl lg:text-[4.25rem] ${
              isCenter ? "max-w-[700px]" : "max-w-[640px]"
            }`}
          >
            {title}
          </h1>
        </Reveal>
        {subtitle && (
          <Reveal delay={250}>
            <p
              className={`hero-text-shadow mt-6 text-base leading-relaxed text-ivory/90 lg:text-lg ${
                isCenter ? "max-w-[600px]" : "max-w-[560px]"
              }`}
            >
              {subtitle}
            </p>
          </Reveal>
        )}
        {cta && (
          <Reveal delay={350}>
            <div className="mt-9">
              {cta.to ? (
                <Link
                  to={cta.to}
                  className="group inline-flex items-center gap-3 border border-ivory bg-ivory px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
                >
                  <span>{cta.label}</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              ) : (
                <a
                  href={cta.href}
                  className="group inline-flex items-center gap-3 border border-ivory bg-ivory px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
                >
                  <span>{cta.label}</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              )}
            </div>
          </Reveal>
        )}
      </div>
      {priceCard && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-6 sm:bottom-8 lg:inset-x-auto lg:right-12 lg:bottom-20 lg:justify-end lg:px-0">
          <Reveal delay={400}>
            <div className="pointer-events-auto w-full max-w-[320px] border border-ivory/25 bg-charcoal/55 px-6 py-5 text-ivory shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur-md sm:max-w-[340px] lg:w-[340px] lg:px-7 lg:py-6">
              {priceCard.eyebrow && (
                <p className="text-[0.6rem] uppercase tracking-[0.28em] text-ivory/70">
                  {priceCard.eyebrow}
                </p>
              )}
              <p className="mt-2 font-display text-lg leading-tight text-ivory lg:text-xl">
                {priceCard.name}
              </p>
              <div className="mt-3 flex items-baseline gap-2 border-t border-ivory/20 pt-3">
                <span className="text-[0.6rem] uppercase tracking-[0.24em] text-ivory/65">From</span>
                <span className="font-display text-3xl leading-none lg:text-4xl">{priceCard.price}</span>
                {priceCard.unit && (
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] text-ivory/65">
                    / {priceCard.unit}
                  </span>
                )}
              </div>
              {priceCard.note && (
                <p className="mt-3 text-xs leading-relaxed text-ivory/70">{priceCard.note}</p>
              )}
              {priceCard.cta && (
                <Link
                  to={priceCard.cta.to}
                  className="group mt-4 inline-flex w-full items-center justify-center gap-3 border border-ivory/80 bg-ivory/95 px-5 py-3 text-[0.65rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
                >
                  <span>{priceCard.cta.label}</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      )}
    </section>
  );
}