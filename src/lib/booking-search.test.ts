import { describe, expect, it } from "vitest";
import { validateBookingSearch } from "./booking-search";

describe("concierge direct-booking search validation", () => {
  it("accepts complete dates, party size and SPE child occupancy buckets", () => {
    expect(validateBookingSearch({
      check_in: "2026-12-01",
      check_out: "2026-12-03",
      adults: "2",
      children: "2",
      children_below_6: "1",
      children_7_plus: "1",
      room: "family-suite",
    })).toMatchObject({
      check_in: "2026-12-01",
      check_out: "2026-12-03",
      adults: 2,
      children_below_6: 1,
      children_7_plus: 1,
      room: "family-suite",
    });
  });

  it("rejects invalid dates and inconsistent child counts", () => {
    const result = validateBookingSearch({
      check_in: "2026-02-30",
      check_out: "2026-02-31",
      adults: "2",
      children: "2",
      children_below_6: "1",
      children_7_plus: "0",
    });
    expect(result.check_in).toBeUndefined();
    expect(result.check_out).toBeUndefined();
    expect(result.children_below_6).toBeUndefined();
    expect(result.children_7_plus).toBeUndefined();
  });

  it("keeps the existing booking session and step parameters", () => {
    expect(validateBookingSearch({ step: "2", session: "session-1", room: "suite" }))
      .toMatchObject({ step: 2, session: "session-1", room: "suite" });
  });
});
