/**
 * World Luxury Hotel Awards (WLHA) awareness campaign.
 *
 * Single source of truth for the homepage banner: copy, dates and CTAs.
 * Update this file after the voting period ends — no layout changes required.
 */
export const WLHA_CAMPAIGN = {
  enabled: true,
  eyebrow: "World Luxury Hotel Awards",
  headline: "Celebrating Excellence in Hospitality",
  body:
    "Mtoni River Lodge is honoured to participate in the upcoming World Luxury Hotel Awards, celebrating excellence, exceptional service, and unforgettable hospitality experiences around the world.",
  message:
    "Join us in representing Tanzania's unique warmth, natural beauty, and luxury hospitality excellence.",
  votingOpens: "17 August 2026",
  votingCloses: "31 August 2026",
  get votingNote() {
    return `Voting opens on ${this.votingOpens} and closes on ${this.votingCloses}.`;
  },
  primaryCta: { label: "Vote for Mtoni", to: "/wlha-voting" },
  secondaryCta: { label: "Discover Mtoni", to: "/experiences" },
  tertiaryCta: { label: "Book Your Stay", to: "/book" },
} as const;
