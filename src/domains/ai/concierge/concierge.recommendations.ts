import type {
  ConciergeIntentSignal,
  ConciergeRecommendation,
  ConciergeRoomRecommendation,
  ConciergeExperienceRecommendation,
  ConciergeRoomCatalogItem,
  ConciergeExperienceCatalogItem,
} from "./concierge.types";

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function recommendRooms(
  intent: ConciergeIntentSignal,
  catalog: ConciergeRoomCatalogItem[],
): ConciergeRoomRecommendation[] {
  const adults = intent.detected.adults ?? 2;
  const children = intent.detected.children ?? 0;
  const party = adults + children;
  return catalog
    .filter((room) =>
      Number.isFinite(room.base_price) &&
      Number.isFinite(room.max_occupancy) &&
      /^[A-Z]{3}$/.test(room.currency),
    )
    .map((room) => {
      let score = 0.5;
      const reasoning: string[] = [];
      const fits = adults <= room.capacity_adults && children <= room.capacity_children && party <= room.max_occupancy;
      if (fits) {
        score += 0.3;
        reasoning.push(`Configured capacity fits ${adults} adult(s) and ${children} child(ren).`);
      } else {
        score -= 0.45;
        reasoning.push("Does not fit the requested party configuration.");
      }
      if (children > 0 && room.capacity_children >= children) {
        score += 0.1;
        reasoning.push("Configured for the requested children.");
      }
      if (reasoning.length === 0) reasoning.push(room.short_description ?? "Configured room option.");
      return {
        type: "room" as const,
        slug: room.slug,
        name: room.name,
        reasoning,
        confidence: Math.max(0.05, Math.min(0.95, score)),
        from_price: Number(room.base_price),
        currency: room.currency,
      };
    })
    .filter((room) => room.reasoning[0] !== "Does not fit the requested party configuration.")
    .sort((a, b) => b.confidence - a.confidence || a.from_price - b.from_price)
    .slice(0, 2);
}

export function recommendExperiences(
  intent: ConciergeIntentSignal,
  catalog: ConciergeExperienceCatalogItem[],
): ConciergeExperienceRecommendation[] {
  const interests = new Set((intent.detected.interests ?? []).map(normalise));
  if (interests.size === 0) return [];
  return catalog
    .filter((item) =>
      Number.isFinite(item.price) &&
      /^[A-Z]{3}$/.test(item.currency) &&
      item.slug.trim().length > 0 &&
      item.name.trim().length > 0,
    )
    .map((item) => {
      const searchable = normalise(`${item.slug} ${item.name} ${item.description ?? ""}`);
      const matched = [...interests].filter((interest) =>
        interest.length > 2 && (searchable.includes(interest) || interest.split(" ").some((word) => searchable.includes(word))),
      );
      return {
        item,
        matched,
        score: Math.min(0.95, 0.55 + matched.length * 0.15),
      };
    })
    .filter(({ matched }) => matched.length > 0)
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, 3)
    .map(({ item, matched, score }) => ({
      type: "experience" as const,
      slug: item.slug,
      name: item.name,
      reasoning: [`Matches guest interest: ${matched.join(", ")}.`],
      confidence: score,
      from_price: item.price,
      currency: item.currency,
      unit: item.unit,
    }));
}

export function combinedRecommendations(
  intent: ConciergeIntentSignal,
  rooms: ConciergeRoomCatalogItem[],
  experiences: ConciergeExperienceCatalogItem[] = [],
): ConciergeRecommendation[] {
  return [
    ...recommendRooms(intent, rooms),
    ...recommendExperiences(intent, experiences),
  ];
}
