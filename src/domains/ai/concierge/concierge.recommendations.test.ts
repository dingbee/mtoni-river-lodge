import { describe, expect, it } from "vitest";
import { classifyIntent } from "./concierge.intent";
import { recommendRooms } from "./concierge.recommendations";

describe("Concierge room recommendations", () => {
  it("recommends by property-scoped capacity without reading or exposing room base rates", () => {
    const intent = classifyIntent("We are 2 adults and 1 child.");
    const recommendations = recommendRooms(intent, [{
      slug: "family-suite",
      name: "Family Suite",
      short_description: "A spacious family room.",
      capacity_adults: 2,
      capacity_children: 2,
      max_occupancy: 4,
    }]);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({ type: "room", slug: "family-suite" });
    expect(recommendations[0]).not.toHaveProperty("from_price");
    expect(recommendations[0]).not.toHaveProperty("currency");
  });
});
