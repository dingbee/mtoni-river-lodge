import { describe, expect, it } from "vitest";
import { buildBookingPlan, mapAvailabilityForParty } from "./concierge.tools";
import type { ConciergeIntentSignal } from "./concierge.types";

const intent: ConciergeIntentSignal = {
  level: "high", confidence: 0.9, keywords: ["availability"],
  detected: { check_in: "2026-12-10", check_out: "2026-12-13", nights: 3, adults: 2, children: 1, interests: ["canoe"] },
};
const rows = [
  { slug: "standard", name: "Standard", capacity_adults: 2, capacity_children: 1, max_occupancy: 3, base_price: 100000, currency: "TZS", is_available: true, min_available: 2, nightly_total: 300000, nights: 3 },
  { slug: "deluxe", name: "Deluxe", capacity_adults: 2, capacity_children: 0, max_occupancy: 2, base_price: 140, currency: "USD", is_available: true, min_available: 1, nightly_total: 420, nights: 3 },
];

describe("concierge availability and quotation", () => {
  it("marks party fit using adult, child and total capacity", () => {
    expect(mapAvailabilityForParty(rows, 2, 1).map((r) => r.fits_party)).toEqual([true, false]);
  });
  it("preserves authoritative property currency and full-stay total", () => {
    const plan = buildBookingPlan(intent, mapAvailabilityForParty(rows.slice(0, 1), 2, 1));
    expect(plan?.estimated_total).toBe(300000);
    expect(plan?.currency).toBe("TZS");
    expect(plan?.room?.total_price).toBe(300000);
  });
  it("never selects a room that cannot fit the party", () => {
    const plan = buildBookingPlan(intent, mapAvailabilityForParty(rows, 2, 1));
    expect(plan?.room?.slug).toBe("standard");
  });
  it("does not combine experience prices from a different currency", () => {
    const plan = buildBookingPlan(intent, mapAvailabilityForParty(rows.slice(0, 1), 2, 1), undefined, [
      { slug: "canoe", name: "Canoeing", price: 45000, currency: "TZS", unit: "per_person" },
      { slug: "transfer", name: "Transfer", price: 25, currency: "USD", unit: "per_stay" },
    ]);
    expect(plan?.experiences.map((e) => e.slug)).toEqual(["canoe"]);
  });
  it("rejects invalid dates and stay lengths", () => {
    expect(buildBookingPlan({ ...intent, detected: { ...intent.detected, check_in: "2026-02-31" } }, [])).toBeNull();
    expect(buildBookingPlan({ ...intent, detected: { ...intent.detected, nights: 0 } }, [])).toBeNull();
  });
  it("does not expose an unvalidated currency total", () => {
    const plan = buildBookingPlan(intent, mapAvailabilityForParty([{ ...rows[0], currency: "TZS?" }], 2, 1));
    expect(plan?.estimated_total).toBeUndefined();
    expect(plan?.currency).toBeUndefined();
  });
});
