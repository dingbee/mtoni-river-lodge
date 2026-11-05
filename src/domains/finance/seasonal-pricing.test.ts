import { describe, expect, it } from "vitest";
import {
  mergeSeasonalRateRecords,
  seasonalRatesSchema,
  resolveSeasonalRateForDate,
  validateSeasonalRateCurrency,
  validateSeasonalRateRoomTypes,
} from "./seasonal-pricing";

const ROOM_A = "b9061450-e1b5-4f16-9ba5-6e781568be7e";
const ROOM_B = "7e57cca8-b271-497b-b09b-bcfcab036767";

function season(overrides: Record<string, unknown> = {}) {
  return {
    name: "Low season",
    description: "Quiet period",
    season_type: "low",
    start_date: "2027-01-01",
    end_date: "2027-03-31",
    room_type_ids: [ROOM_A],
    currency: "USD",
    nightly_rate: 125,
    priority: 10,
    active: true,
    ...overrides,
  };
}

describe("SPE-03.05 seasonal pricing contract", () => {
  it.each(["low", "high", "festive"])("accepts the %s season category", (season_type) => {
    expect(seasonalRatesSchema.parse({ "season-a": season({ season_type }) })["season-a"].season_type)
      .toBe(season_type);
  });

  it("accepts an exact inclusive effective-date boundary", () => {
    expect(seasonalRatesSchema.parse({ "season-a": season({ start_date: "2027-12-20", end_date: "2027-12-31" }) }))
      .toHaveProperty("season-a");
  });

  it("rejects an inverted effective-date range", () => {
    expect(seasonalRatesSchema.safeParse({
      "season-a": season({ start_date: "2027-04-01", end_date: "2027-03-31" }),
    }).success).toBe(false);
  });

  it("rejects overlapping active seasons with equal priority for the same room type", () => {
    expect(seasonalRatesSchema.safeParse({
      "season-a": season(),
      "season-b": season({ start_date: "2027-03-01", end_date: "2027-04-30" }),
    }).success).toBe(false);
  });

  it("allows overlapping seasons only when explicit priorities differ", () => {
    expect(seasonalRatesSchema.safeParse({
      "season-a": season({ priority: 10 }),
      "season-b": season({ start_date: "2027-03-01", end_date: "2027-04-30", priority: 20 }),
    }).success).toBe(true);
  });

  it("does not treat different room types as an overlap", () => {
    expect(seasonalRatesSchema.safeParse({
      "season-a": season({ room_type_ids: [ROOM_A] }),
      "season-b": season({ room_type_ids: [ROOM_B] }),
    }).success).toBe(true);
  });

  it("ignores inactive seasons when checking conflicts", () => {
    expect(seasonalRatesSchema.safeParse({
      "season-a": season({ active: false }),
      "season-b": season(),
    }).success).toBe(true);
  });

  it("deep-merges child season fields while preserving inherited fields", () => {
    const merged = mergeSeasonalRateRecords(
      { "festive-2027": season({ nightly_rate: 200, priority: 5 }) },
      { "festive-2027": { nightly_rate: 250 } },
    );
    expect(merged["festive-2027"]).toMatchObject({ nightly_rate: 250, priority: 5 });
  });

  it("allows a child to clear an inherited season by setting its key to null", () => {
    const merged = mergeSeasonalRateRecords({ "festive-2027": season() }, { "festive-2027": null });
    expect(merged["festive-2027"]).toBeNull();
  });

  it("selects the highest-priority season on inclusive date boundaries", () => {
    const rates = seasonalRatesSchema.parse({
      "low-2027": season({ name: "Low", priority: 10, start_date: "2027-01-01", end_date: "2027-03-31" }),
      "festive-2027": season({ name: "Festive", season_type: "festive", priority: 50, start_date: "2027-03-31", end_date: "2027-04-07", nightly_rate: 300 }),
    });
    expect(resolveSeasonalRateForDate(rates, ROOM_A, "2027-03-31")?.name).toBe("Festive");
    expect(resolveSeasonalRateForDate(rates, ROOM_A, "2027-04-07")?.name).toBe("Festive");
    expect(resolveSeasonalRateForDate(rates, ROOM_A, "2027-04-08")).toBeNull();
  });

  it("requires explicit property currency and room-catalogue membership", () => {
    const rates = seasonalRatesSchema.parse({ "season-a": season() });
    expect(() => validateSeasonalRateCurrency(rates, "USD")).not.toThrow();
    expect(() => validateSeasonalRateCurrency(rates, "TZS")).toThrow(/must match the property currency/);
    expect(() => validateSeasonalRateRoomTypes(rates, new Set([ROOM_A]))).not.toThrow();
    expect(() => validateSeasonalRateRoomTypes(rates, new Set([ROOM_B]))).toThrow(/outside the active property catalogue/);
  });
});
