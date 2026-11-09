import { describe, expect, it } from "vitest";
import { calculateCommercialProration, nextCommercialBillingPeriod } from "./commercial-billing-engine";

describe("CC-04 billing period and proration engine", () => {
  it("calculates monthly periods without month-end overflow", () => {
    expect(nextCommercialBillingPeriod("2026-01-31T09:00:00.000Z","monthly").endsAt)
      .toBe("2026-02-28T09:00:00.000Z");
    expect(nextCommercialBillingPeriod("2024-01-31T09:00:00.000Z","monthly").endsAt)
      .toBe("2024-02-29T09:00:00.000Z");
  });
  it("calculates annual periods and clamps leap-day anniversaries", () => {
    expect(nextCommercialBillingPeriod("2024-02-29T12:00:00.000Z","annual").endsAt)
      .toBe("2025-02-28T12:00:00.000Z");
  });
  it("uses explicit integer proration and rounding", () => {
    expect(calculateCommercialProration({fullAmountMinor:10000,billableUnits:1,totalUnits:3,rounding:"half_up"})).toBe(3333);
    expect(calculateCommercialProration({fullAmountMinor:10000,billableUnits:1,totalUnits:3,rounding:"floor"})).toBe(3333);
    expect(calculateCommercialProration({fullAmountMinor:2,billableUnits:1,totalUnits:3,rounding:"half_up"})).toBe(1);
  });
  it("rejects invalid period and proration inputs", () => {
    expect(() => nextCommercialBillingPeriod("bad","monthly")).toThrow();
    expect(() => calculateCommercialProration({fullAmountMinor:100,billableUnits:4,totalUnits:3,rounding:"floor"})).toThrow();
  });
});
