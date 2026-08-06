/**
 * World Luxury Hotel Awards (WLHA) awareness campaign.
 *
 * Single source of truth for the homepage banner: copy, dates and CTAs.
 * Update this file after the voting period ends — no layout changes required.
 */
export const WLHA_CAMPAIGN = {
  enabled: true,
  name: "World Luxury Hotel Awards 2026",
  eyebrow: "World Luxury Hotel Awards",
  headline: "Celebrating Excellence in Hospitality",
  body:
    "Mtoni River Lodge is honoured to participate in the upcoming World Luxury Hotel Awards, celebrating excellence, exceptional service, and unforgettable hospitality experiences around the world.",
  message:
    "Join us in representing Tanzania's unique warmth, natural beauty, and luxury hospitality excellence.",

  /** Absolute campaign boundaries (East Africa Time, UTC+3). */
  votingStart: "2026-08-17T00:00:00+03:00",
  votingEnd: "2026-08-31T23:59:59+03:00",
  votingOpens: "17 August 2026",
  votingCloses: "31 August 2026",
  get votingNote() {
    return `Voting opens on ${this.votingOpens} and closes on ${this.votingCloses}.`;
  },

  /** Official WLHA voting page — replace when organisers publish the final URL. */
  votingUrl: "https://luxuryhotelawards.com/vote/",

  states: {
    upcoming: "Voting begins in",
    active: "Voting is now open. Support Mtoni!",
    closed: "Voting has closed. Thank you for your support.",
  },

  shareMessage:
    "Support Mtoni River Lodge in the World Luxury Hotel Awards. Vote and celebrate Tanzania's luxury hospitality excellence.",
  shareTitle: "Mtoni River Lodge — World Luxury Hotel Awards",

  primaryCta: { label: "Vote for Mtoni" },
  secondaryCta: { label: "Discover Mtoni", to: "/experiences" },
  tertiaryCta: { label: "Book Your Stay", to: "/book" },
} as const;

export type WlhaPhase = "upcoming" | "active" | "closed";

export function getWlhaPhase(now: number): WlhaPhase {
  const start = Date.parse(WLHA_CAMPAIGN.votingStart);
  const end = Date.parse(WLHA_CAMPAIGN.votingEnd);
  if (now < start) return "upcoming";
  if (now <= end) return "active";
  return "closed";
}

export function getWlhaTarget(phase: WlhaPhase): number | null {
  if (phase === "upcoming") return Date.parse(WLHA_CAMPAIGN.votingStart);
  if (phase === "active") return Date.parse(WLHA_CAMPAIGN.votingEnd);
  return null;
}
