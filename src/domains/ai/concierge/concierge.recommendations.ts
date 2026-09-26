import type { ConciergeIntentSignal, ConciergeRecommendation, ConciergeRoomRecommendation, ConciergeExperienceRecommendation, ConciergeRoomCatalogItem } from "./concierge.types";

export function recommendRooms(intent: ConciergeIntentSignal, catalog: ConciergeRoomCatalogItem[]): ConciergeRoomRecommendation[] {
  const adults = intent.detected.adults ?? 2;
  const children = intent.detected.children ?? 0;
  const party = adults + children;
  return catalog.map((room) => {
    let score = 0.5;
    const reasoning: string[] = [];
    if (party <= room.max_occupancy) { score += 0.2; reasoning.push("Fits a party of " + party + "."); }
    else { score -= 0.35; reasoning.push("Does not fit a party of " + party + "."); }
    if (children > 0 && room.capacity_children >= children) { score += 0.1; reasoning.push("Configured for the requested children."); }
    if (reasoning.length === 0) reasoning.push(room.short_description ?? "Configured room option.");
    return { type:"room" as const, slug:room.slug, name:room.name, reasoning, confidence:Math.max(0.05,Math.min(0.95,score)), from_price_usd:Number(room.base_price) };
  }).filter((r) => r.confidence > 0.2).sort((a,b) => b.confidence-a.confidence).slice(0,2);
}

export function recommendExperiences(_intent: ConciergeIntentSignal): ConciergeExperienceRecommendation[] { return []; }

export function combinedRecommendations(intent: ConciergeIntentSignal, catalog: ConciergeRoomCatalogItem[]): ConciergeRecommendation[] {
  return recommendRooms(intent, catalog);
}
