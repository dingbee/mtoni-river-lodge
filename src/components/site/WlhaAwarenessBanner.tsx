import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Copy, Facebook, Instagram, MessageCircle, Share2, Twitter } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { WLHA_CAMPAIGN, getWlhaPhase, getWlhaTarget, type WlhaPhase } from "@/lib/wlha-campaign";
import voteMaasaiRiverAsset from "@/assets/vote-maasai-river.jpg.asset.json";
import wlhaEmblemAsset from "@/assets/wlha-nominee-2026.png.asset.json";

function useCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function CountdownUnits({ ms }: { ms: number }) {
  const t = split(ms);
  const units: Array<[string, string]> = [
    [String(t.days), "Days"],
    [pad(t.hours), "Hours"],
    [pad(t.minutes), "Minutes"],
    [pad(t.seconds), "Seconds"],
  ];
  return (
    <div className="mt-6 flex flex-wrap items-stretch justify-center gap-2 sm:gap-3">
      {units.map(([value, label]) => (
        <div
          key={label}
          className="min-w-[68px] border border-ivory/25 px-3 py-3 sm:min-w-[84px] sm:px-5 sm:py-4"
        >
          <div className="font-display text-2xl leading-none tabular-nums text-ivory sm:text-3xl">
            {value}
          </div>
          <div className="mt-2 text-[0.55rem] uppercase tracking-[0.28em] text-ivory/60 sm:text-[0.6rem]">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShareControls() {
  const c = WLHA_CAMPAIGN;
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("https://mtoniriverlodge.com/");

  useEffect(() => {
    setShareUrl(window.location.origin + "/");
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const text = c.shareMessage;
  const enc = encodeURIComponent;
  const links = [
    { label: "Share on WhatsApp", Icon: MessageCircle, href: `https://wa.me/?text=${enc(`${text} ${shareUrl}`)}` },
    { label: "Share on Facebook", Icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}` },
    { label: "Share on X", Icon: Twitter, href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(shareUrl)}` },
    { label: "Share on Instagram", Icon: Instagram, href: "https://www.instagram.com/" },
  ];

  const iconClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-ivory/30 text-ivory/85 transition-colors hover:border-ivory hover:bg-ivory hover:text-charcoal";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: c.shareTitle, text, url: shareUrl });
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="mt-10">
      <p className="text-[0.6rem] uppercase tracking-[0.32em] text-ivory/55">Share the nomination</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {canNativeShare && (
          <button type="button" onClick={nativeShare} aria-label="Share" title="Share" className={iconClass}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {links.map(({ label, Icon, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className={iconClass}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </a>
        ))}
        <button
          type="button"
          onClick={copyLink}
          aria-label={copied ? "Link copied" : "Copy link"}
          title={copied ? "Link copied" : "Copy link"}
          className={iconClass}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

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
  return <WlhaBannerInner />;
}

function WlhaBannerInner() {
  const c = WLHA_CAMPAIGN;
  const now = useCountdown();
  const phase: WlhaPhase | null = now === null ? null : getWlhaPhase(now);
  const target = phase ? getWlhaTarget(phase) : null;

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
          <div className="mt-10">
            <p className="text-[0.68rem] uppercase tracking-[0.24em] text-ivory/85" aria-live="polite">
              {phase === null
                ? "Voting Period"
                : phase === "upcoming"
                  ? c.states.upcoming
                  : phase === "active"
                    ? c.states.active
                    : c.states.closed}
            </p>
            {phase !== null && target !== null && now !== null ? (
              <>
                <CountdownUnits ms={target - now} />
                {phase === "active" && (
                  <p className="mt-4 text-[0.6rem] uppercase tracking-[0.32em] text-ivory/55">
                    Until voting closes
                  </p>
                )}
              </>
            ) : (
              <p className="mt-6 inline-block border-y border-ivory/25 px-6 py-4 text-[0.68rem] uppercase tracking-[0.24em] text-ivory/85">
                <time dateTime="2026-08-17">{c.votingOpens}</time>
                <span className="rule" aria-hidden="true" />
                <time dateTime="2026-08-31">{c.votingCloses}</time>
              </p>
            )}
            <p className="sr-only">{c.votingNote}</p>
          </div>
        </Reveal>

        <Reveal delay={350}>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
            {phase !== "closed" && (
              <a
                href={c.votingUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={phase !== "active" ? true : undefined}
                className={`group inline-flex w-full items-center justify-center gap-3 border border-ivory bg-ivory px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory sm:w-auto ${
                  phase === "upcoming" ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <span>{c.primaryCta.label}</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            )}
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

        <Reveal delay={450}>
          <ShareControls />
        </Reveal>
      </div>
    </section>
  );
}
