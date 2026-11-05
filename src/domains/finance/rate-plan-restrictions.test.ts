import { describe, expect, it } from "vitest";
import {
  evaluateStayNasRestrictions,
  mergeRestrictionRecords,
  restrictionRulesSchema,
  validateRestrictionRoomTypes,
  type RestrictionRule,
} from "./rate-plan-restrictions";

const ROOM_TYPE = "b9061450-e1b5-4f16-9ba5-6e781568be7e";
const OTHER_TYPE = "7e57cca8-b271-497b-b09b-bcfcab036767";

const rule = (type: RestrictionRule["type"], extra: Record<string, unknown> = {}) => ({
  type,
  start_date: "2027-01-01",
  end_date: "2027-01-31",
  room_type_ids: [ROOM_TYPE],
  active: true,
  reason: "UAT restriction test",
  ...extra,
});

describe("SPE-03.08 rate-plan restrictions", () => {
  it("validates all seven restriction types and their effective periods", () => {
    const rules = {
      min: rule("min_los", { value: 2 }),
      max: rule("max_los", { value: 10 }),
      arrival: rule("closed_to_arrival"),
      departure: rule("closed_to_departure"),
      stop: rule("stop_sell"),
      minLead: rule("advance_booking_min_hours", { value: 24 }),
      maxLead: rule("advance_booking_max_days", { value: 90 }),
    };
    expect(Object.keys(restrictionRulesSchema.parse(rules))).toHaveLength(7);
    expect(restrictionRulesSchema.safeParse({ invalid: rule("min_los", { value: 0 }) }).success).toBe(false);
    expect(restrictionRulesSchema.safeParse({ invalid: rule("stop_sell", { end_date: "2026-12-01" }) }).success).toBe(false);
  });

  it("merges child rules by key and lets an explicit null clear an inherited rule", () => {
    const inherited = { peak: rule("min_los", { value: 3 }), stop: rule("stop_sell") };
    const child = { peak: rule("min_los", { value: 5 }), stop: null, arrival: rule("closed_to_arrival") };
    const merged = mergeRestrictionRecords(inherited, child);
    expect(merged.peak).toMatchObject({ type: "min_los", value: 5 });
    expect(merged.stop).toBeUndefined();
    expect(merged.arrival).toBeDefined();
  });

  it("rejects room types outside the property's configured catalogue", () => {
    const parsed = restrictionRulesSchema.parse({ min: rule("min_los", { room_type_ids: [OTHER_TYPE] }) });
    expect(() => validateRestrictionRoomTypes(parsed as Record<string, RestrictionRule>, new Set([ROOM_TYPE])))
      .toThrow(/outside this property's catalogue/);
  });

  it("enforces minimum and maximum length of stay", () => {
    const rules = restrictionRulesSchema.parse({
      min: rule("min_los", { value: 3 }),
      max: rule("max_los", { value: 7 }),
    }) as Record<string, RestrictionRule>;
    expect(evaluateStayNasRestrictions(rules, { roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-02", departureDate: "2027-01-04" }).reasons[0])
      .toMatch(/Minimum stay is 3 nights/);
    expect(evaluateStayNasRestrictions(rules, { roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-02", departureDate: "2027-01-11" }).reasons[0])
      .toMatch(/Maximum stay is 7 nights/);
  });

  it("enforces closed arrival, closed departure and stop-sell without inventory input", () => {
    const rules = restrictionRulesSchema.parse({
      arrival: rule("closed_to_arrival", { start_date: "2027-01-02", end_date: "2027-01-02" }),
      departure: rule("closed_to_departure", { start_date: "2027-01-04", end_date: "2027-01-04" }),
      stop: rule("stop_sell", { start_date: "2027-01-03", end_date: "2027-01-03" }),
    }) as Record<string, RestrictionRule>;
    const result = evaluateStayNasRestrictions(rules, {
      roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-02", departureDate: "2027-01-04",
    });
    expect(result.sellable).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });

  it("enforces minimum-hour and maximum-day advance booking windows", () => {
    const rules = restrictionRulesSchema.parse({
      min: rule("advance_booking_min_hours", { value: 24 }),
      max: rule("advance_booking_max_days", { value: 30 }),
    }) as Record<string, RestrictionRule>;
    const tooLate = evaluateStayNasRestrictions(rules, {
      roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-10", departureDate: "2027-01-12",
      bookedAt: "2027-01-09T12:00:00Z", arrivalAt: "2027-01-10T12:00:00Z",
    });
    expect(tooLate.reasons[0]).toMatch(/at least 24 hours/);
    const tooEarly = evaluateStayNasRestrictions(rules, {
      roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-10", departureDate: "2027-01-12",
      bookedAt: "2026-11-01T12:00:00Z", arrivalAt: "2027-01-10T12:00:00Z",
    });
    expect(tooEarly.reasons[0]).toMatch(/more than 30 days/);
  });

  it("returns an explicit unsellable reason for invalid dates and contradictory LOS rules", () => {
    const invalid = evaluateStayNasRestrictions({}, {
      roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-02", departureDate: "2027-01-02",
    });
    expect(invalid.sellable).toBe(false);
    expect(invalid.reasons[0]).toMatch(/departure must be after arrival/);
    const conflict = restrictionRulesSchema.parse({
      min: rule("min_los", { value: 6 }),
      max: rule("max_los", { value: 3 }),
    }) as Record<string, RestrictionRule>;
    expect(evaluateStayNasRestrictions(conflict, {
      roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-02", departureDate: "2027-01-05",
    }).reasons.at(-1)).toMatch(/Conflicting stay-length restrictions/);
  });

  it("ignores inactive rules and rules for other room types", () => {
    const rules = restrictionRulesSchema.parse({
      inactive: rule("stop_sell", { active: false }),
      other: rule("stop_sell", { room_type_ids: [OTHER_TYPE] }),
    }) as Record<string, RestrictionRule>;
    expect(evaluateStayNasRestrictions(rules, {
      roomTypeId: ROOM_TYPE, arrivalDate: "2027-01-02", departureDate: "2027-01-03",
    }).sellable).toBe(true);
  });
});
