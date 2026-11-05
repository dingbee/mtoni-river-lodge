import { describe, expect, it } from "vitest";
import {
  dailyRatesSchema,
  mergeDailyRateRecords,
  resolveDailyRate,
  validateDailyRateCurrency,
  validateDailyRateRoomTypes,
} from "./daily-rate-calendar";

const ROOM_A = "b9061450-e1b5-4f16-9ba5-6e781568be7e";
const ROOM_B = "7e57cca8-b271-497b-b09b-bcfcab036767";

const rate = (nightly_rate = 180, active = true) => ({
  nightly_rate,
  currency: "USD",
  active,
});

describe("SPE-03.06 daily rate calendar", () => {
  it("accepts exact ISO property-local calendar dates and room-type rates", () => {
    const rates = dailyRatesSchema.parse({ "2027-01-01": { [ROOM_A]: rate() } });
    expect(rates["2027-01-01"][ROOM_A].nightly_rate).toBe(180);
  });

  it("rejects malformed dates, room type identifiers and non-positive rates", () => {
    expect(dailyRatesSchema.safeParse({ "01-01-2027": { [ROOM_A]: rate() } }).success).toBe(false);
    expect(dailyRatesSchema.safeParse({ "2027-01-01": { "not-a-uuid": rate() } }).success).toBe(false);
    expect(dailyRatesSchema.safeParse({ "2027-01-01": { [ROOM_A]: rate(0) } }).success).toBe(false);
  });

  it("deep-merges a child room-type override without removing other inherited rates", () => {
    const merged = mergeDailyRateRecords(
      { "2027-01-01": { [ROOM_A]: rate(150), [ROOM_B]: rate(190) } },
      { "2027-01-01": { [ROOM_A]: rate(175) } },
    );
    expect(merged["2027-01-01"]).toMatchObject({ [ROOM_A]: rate(175), [ROOM_B]: rate(190) });
  });

  it("supports explicit clearing of one inherited room-type rate or a whole date", () => {
    const roomCleared = mergeDailyRateRecords(
      { "2027-01-01": { [ROOM_A]: rate(), [ROOM_B]: rate() } },
      { "2027-01-01": { [ROOM_A]: null } },
    );
    expect(roomCleared["2027-01-01"]).toMatchObject({ [ROOM_A]: null, [ROOM_B]: rate() });
    const dateCleared = mergeDailyRateRecords({ "2027-01-01": { [ROOM_A]: rate() } }, { "2027-01-01": null });
    expect(dateCleared["2027-01-01"]).toBeNull();
  });

  it("resolves only active exact-date overrides", () => {
    const rates = dailyRatesSchema.parse({
      "2027-01-01": { [ROOM_A]: rate(200), [ROOM_B]: rate(220, false) },
    });
    expect(resolveDailyRate(rates, ROOM_A, "2027-01-01")?.nightly_rate).toBe(200);
    expect(resolveDailyRate(rates, ROOM_B, "2027-01-01")).toBeNull();
    expect(resolveDailyRate(rates, ROOM_A, "2027-01-02")).toBeNull();
  });

  it("enforces property currency and room-catalogue membership", () => {
    const rates = dailyRatesSchema.parse({ "2027-01-01": { [ROOM_A]: rate() } });
    expect(() => validateDailyRateCurrency(rates, "USD")).not.toThrow();
    expect(() => validateDailyRateCurrency(rates, "TZS")).toThrow(/must match property currency/);
    expect(() => validateDailyRateRoomTypes(rates, new Set([ROOM_A]))).not.toThrow();
    expect(() => validateDailyRateRoomTypes(rates, new Set([ROOM_B]))).toThrow(/outside the active property catalogue/);
  });
});
