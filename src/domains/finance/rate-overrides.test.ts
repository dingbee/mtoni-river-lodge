import { describe, expect, it } from "vitest";
import {
  assertNoApprovedOverrideConflict,
  conflictsWithApprovedOverride,
  rateOverrideSchema,
} from "./rate-overrides";

const ROOM = "b9061450-e1b5-4f16-9ba5-6e781568be7e";
const TYPE = "a9061450-e1b5-4f16-9ba5-6e781568be7e";
const PLAN = "c9061450-e1b5-4f16-9ba5-6e781568be7e";

const base = {
  scope: "room_date" as const,
  rate_plan_id: null,
  room_type_id: null,
  room_id: ROOM,
  effective_from: "2027-01-01",
  effective_to: "2027-01-01",
  nightly_rate: 225,
  currency: "USD",
  reason: "Approved seasonal correction",
  status: "pending" as const,
};

describe("SPE-03.07 rate overrides", () => {
  it("validates exact room/date proposals and preserves property currency", () => {
    const parsed = rateOverrideSchema.parse(base);
    expect(parsed.nightly_rate).toBe(225);
    expect(parsed.currency).toBe("USD");
    expect(parsed.status).toBe("pending");
  });

  it("supports room-type, rate-plan and combined rate-plan/room-type scopes", () => {
    expect(rateOverrideSchema.safeParse({
      ...base, scope: "room_type", room_id: null, room_type_id: TYPE,
      effective_to: "2027-01-31",
    }).success).toBe(true);
    expect(rateOverrideSchema.safeParse({
      ...base, scope: "rate_plan", room_id: null, rate_plan_id: PLAN,
      effective_to: "2027-01-31",
    }).success).toBe(true);
    expect(rateOverrideSchema.safeParse({
      ...base, scope: "rate_plan_room_type", room_id: null,
      rate_plan_id: PLAN, room_type_id: TYPE, effective_to: "2027-01-31",
    }).success).toBe(true);
  });

  it("rejects mismatched scope identifiers, invalid periods, and non-positive rates", () => {
    expect(rateOverrideSchema.safeParse({ ...base, scope: "rate_plan" }).success).toBe(false);
    expect(rateOverrideSchema.safeParse({ ...base, effective_to: "2026-12-31" }).success).toBe(false);
    expect(rateOverrideSchema.safeParse({ ...base, nightly_rate: 0 }).success).toBe(false);
    expect(rateOverrideSchema.safeParse({ ...base, currency: "US" }).success).toBe(false);
  });

  it("detects inclusive overlapping approved overrides only for identical scopes", () => {
    const approved = { ...base, status: "approved" as const, effective_to: "2027-01-05" };
    const candidate = { ...approved, effective_from: "2027-01-05", effective_to: "2027-01-10" };
    expect(conflictsWithApprovedOverride(candidate, approved)).toBe(true);
    expect(conflictsWithApprovedOverride(
      { ...candidate, room_id: "d9061450-e1b5-4f16-9ba5-6e781568be7e" }, approved,
    )).toBe(false);
    expect(conflictsWithApprovedOverride({ ...candidate, status: "pending" }, approved)).toBe(false);
    expect(() => assertNoApprovedOverrideConflict(candidate, [approved])).toThrow(/already covers/);
    expect(() => assertNoApprovedOverrideConflict(candidate, [])).not.toThrow();
  });
});
