import { describe, expect, it } from "vitest";
import { combinedRecommendations, recommendExperiences, recommendRooms } from "./concierge.recommendations";
import type { ConciergeExperienceCatalogItem, ConciergeIntentSignal, ConciergeRoomCatalogItem } from "./concierge.types";

const intent = (overrides: Partial<ConciergeIntentSignal["detected"]> = {}): ConciergeIntentSignal => ({
  level: "high", confidence: 0.9, keywords: ["booking"],
  detected: { adults: 2, children: 0, interests: ["canoe", "dining"], ...overrides },
});
const rooms: ConciergeRoomCatalogItem[] = [
  { slug: "standard", name: "Standard", capacity_adults: 2, capacity_children: 1, max_occupancy: 3, base_price: 100, currency: "TZS" },
  { slug: "family", name: "Family", capacity_adults: 4, capacity_children: 3, max_occupancy: 5, base_price: 180, currency: "TZS" },
  { slug: "small", name: "Small", capacity_adults: 1, capacity_children: 0, max_occupancy: 1, base_price: 70, currency: "TZS" },
];
const extras: ConciergeExperienceCatalogItem[] = [
  { slug: "canoe-duluti", name: "Lake Duluti Canoeing", description: "Guided canoe excursion", price: 45000, currency: "TZS", unit: "per_person" },
  { slug: "private-dining", name: "Private Dining", description: "Special dinner experience", price: 120000, currency: "TZS", unit: "per_stay" },
  { slug: "airport-transfer", name: "Airport Transfer", description: "One-way transfer", price: 60000, currency: "TZS", unit: "per_stay" },
];

describe("property catalogue recommendations", () => {
  it("recommends only rooms fitting the complete adult/child party", () => {
    expect(recommendRooms(intent({ adults: 2, children: 2 }), rooms).map((r) => r.slug)).toEqual(["family"]);
  });
  it("ranks matching property experiences using guest interests", () => {
    const result = recommendExperiences(intent(), extras);
    expect(result.map((r) => r.slug)).toEqual(["canoe-duluti", "private-dining"]);
    expect(result.every((r) => r.currency === "TZS")).toBe(true);
  });
  it("does not invent experiences when the active property catalogue is empty", () => {
    expect(recommendExperiences(intent(), [])).toEqual([]);
  });
  it("combines room and active-catalogue experience recommendations", () => {
    const result = combinedRecommendations(intent(), rooms, extras);
    expect(result.some((r) => r.type === "room")).toBe(true);
    expect(result.filter((r) => r.type === "experience").map((r) => r.slug)).toEqual(["canoe-duluti", "private-dining"]);
  });
  it("rejects malformed currency catalogue entries", () => {
    expect(recommendRooms(intent(), [{ ...rooms[0], currency: "USD$" }])).toEqual([]);
    expect(recommendExperiences(intent(), [{ ...extras[0], currency: "US" }])).toEqual([]);
  });
});
