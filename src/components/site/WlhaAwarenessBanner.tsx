import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/site/Reveal";
import { WLHA_CAMPAIGN } from "@/lib/wlha-campaign";
import voteMaasaiRiverAsset from "@/assets/vote-maasai-river.jpg.asset.json";
import wlhaEmblemAsset from "@/assets/wlha-nominee-2026.png.asset.json";

/**
 * WLHA awareness section — homepage, directly beneath the hero.
 *
 * Reuses the site's existing editorial language: full-bleed imagery with the
 * shared `hero-overlay` gradient, `eyebrow` + `font-display` typography,
 * `Reveal` scroll animation and the standard bordered CTA buttons.
 * All copy, dates and links live in `src/lib/wlha-campaign.ts`.
 */
export function WlhaAwarenessBanner() {
  const c = WLHA_CAMPAIGN;
  if (!c.enabled) return null;

  return (
    <section
      aria-labelledby="wlha-heading"
      className="relative isolate overflow-hidden bg-charcoal text-ivory"
    >
      <img
        src={voteMaasaiRiverAsset.url}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-90"
      />
      <div className="hero-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-charcoal/45" />

      <div className="relative mx-auto max-w-[1100px] px-6 py-24 text-center lg:px-12 lg:py-32">
        <Reveal>
          <img
            src={wlhaEmblemAsset.url}
            alt="World Luxury Hotel Awards Nominee 2026 emblem"
            width={512}
            height={512}
            loading="lazy"
            decoding="async"
            className="mx-auto h-24 w-24 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)] sm:h-28 sm:w-28 lg:h-32 lg:w-32"
          />
          <p className="eyebrow hero-text-shadow mt-6 !text-ivory/85">{c.eyebrow}</p>
          <h2
            id="wlha-heading"
            className="hero-text-shadow mt-4 font-display text-4xl leading-[1.06] text-balance sm:text-5xl lg:text-6xl"
          >
            {c.headline}
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-ivory/85 text-pretty lg:text-lg">
            {c.body}
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ivory/70 text-pretty">
            {c.message}
          </p>
        </Reveal>

        <Reveal delay={250}>
          <p className="mt-10 inline-block border-y border-ivory/25 px-6 py-4 text-[0.68rem] uppercase tracking-[0.24em] text-ivory/85">
            <span className="mb-2 block text-[0.6rem] tracking-[0.32em] text-ivory/60">
              Voting Period
            </span>
            <time dateTime="2026-08-17">{c.votingOpens}</time>
            <span className="rule" aria-hidden="true" />
            <time dateTime="2026-08-31">{c.votingCloses}</time>
          </p>
          <p className="sr-only">{c.votingNote}</p>
        </Reveal>

        <Reveal delay={350}>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
            <Link
              to={c.primaryCta.to}
              className="group inline-flex w-full items-center justify-center gap-3 border border-ivory bg-ivory px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory sm:w-auto"
            >
              <span>{c.primaryCta.label}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to={c.secondaryCta.to}
              className="group inline-flex w-full items-center justify-center gap-3 border border-ivory/70 px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal sm:w-auto"
            >
              <span>{c.secondaryCta.label}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to={c.tertiaryCta.to}
              className="inline-flex items-center justify-center border-b border-ivory/60 pb-1 text-[0.72rem] uppercase tracking-[0.28em] text-ivory/85 transition-colors hover:text-ivory"
            >
              {c.tertiaryCta.label} →
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
