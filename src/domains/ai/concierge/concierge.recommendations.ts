import { ROOMS } from "@/lib/rooms";
import { getBasePriceUsd } from "@/lib/pricing";
import type {
  ConciergeIntentSignal,
  ConciergeRecommendation,
  ConciergeRoomRecommendation,
  ConciergeExperienceRecommendation,
} from "./concierge.types";

export const EXPERIENCES: Array<{ slug: string; name: string; tags: string[]; blurb: string }> = [
  { slug: "river-walk", name: "Nduruma River Walk", tags: ["hike", "nature"], blurb: "Guided riverbank walk with birdlife and forest canopy." },
  { slug: "canoe-duluti", name: "Canoe on Lake Duluti", tags: ["canoe", "nature", "cultural"], blurb: "Paddle a serene crater lake beneath Mount Meru." },
  { slug: "bonfire-dining", name: "Riverside Bonfire Dining", tags: ["dining", "bonfire"], blurb: "Live-fire menu by the water after dusk." },
  { slug: "airport-transfer", name: "Airport Transfer (JRO / ARK)", tags: ["transfer"], blurb: "Private door-to-door transfer from either airport." },
  { slug: "kilimanjaro-prep", name: "Kilimanjaro Trek Prep", tags: ["kilimanjaro", "hike"], blurb: "Early breakfast, gear check, and driver briefing before your climb." },
  { slug: "maasai-cultural", name: "Maasai Cultural Visit", tags: ["cultural"], blurb: "Guided visit to a nearby Maasai boma." },
];

export function recommendRooms(intent: ConciergeIntentSignal): ConciergeRoomRecommendation[] {
  const adults = intent.detected.adults ?? 2;
  const children = intent.detected.children ?? 0;
  const party = adults + children;
  const interests = intent.detected.interests ?? [];

  const scored = ROOMS.map((room) => {
    const price = getBasePriceUsd(room.slug);
    const reasoning: string[] = [];
    let score = 0.5;

    if (room.slug === "family-room") {
      if (party >= 3 || children > 0) { score += 0.35; reasoning.push("Sleeps 3+ with space for children."); }
      else score -= 0.15;
    }
    if (room.slug === "riverfront-deluxe") {
      if (party <= 2) { score += 0.25; reasoning.push("Closest to the river — ideal for couples."); }
      if (interests.includes("cultural") || interests.includes("dining")) { score += 0.05; }
    }
    if (room.slug === "standard-river") {
      if (party <= 2 && !children) { score += 0.15; reasoning.push("Grounded, well-priced riverside stay."); }
    }
    if (reasoning.length === 0) reasoning.push(`${room.shortDesc}`);

    return {
      type: "room" as const,
      slug: room.slug,
      name: room.name,
      reasoning,
      confidence: Math.max(0.5, Math.min(0.95, score)),
      from_price_usd: price,
    };
  });
  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, 2);
}

export function recommendExperiences(intent: ConciergeIntentSignal): ConciergeExperienceRecommendation[] {
  const interests = intent.detected.interests ?? [];
  if (interests.length === 0) return [];
  const scored = EXPERIENCES.map((exp) => {
    const overlap = exp.tags.filter((t) => interests.includes(t)).length;
    return {
      type: "experience" as const,
      slug: exp.slug,
      name: exp.name,
      reasoning: [exp.blurb],
      confidence: overlap > 0 ? Math.min(0.9, 0.55 + 0.15 * overlap) : 0,
    };
  }).filter((e) => e.confidence > 0);
  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, 3);
}

export function combinedRecommendations(intent: ConciergeIntentSignal): ConciergeRecommendation[] {
  return [...recommendRooms(intent), ...recommendExperiences(intent)];
}