import { describe, expect, it } from "vitest";
import { expandRecurringSchedule } from "./calendar-recurrence";

describe("calendar recurrence", () => {
  const base = {
    startsOn: "2026-10-26",
    frequency: "weekly" as const,
    intervalCount: 1,
    daysOfWeek: [1, 3, 5],
    localStart: "09:00",
    localEnd: "17:00",
    timezone: "Africa/Dar_es_Salaam",
  };

  it("expands weekly rules in local calendar dates, exclusive of the end date", () => {
    const result = expandRecurringSchedule(base, "2026-10-26", "2026-11-02");
    expect(result.map((item) => item.occurrenceDate)).toEqual([
      "2026-10-26", "2026-10-28", "2026-10-30",
    ]);
  });

  it("honours interval counts and end dates", () => {
    const result = expandRecurringSchedule({
      ...base, intervalCount: 2, endsOn: "2026-11-08",
    }, "2026-10-26", "2026-11-16");
    expect(result.map((item) => item.occurrenceDate)).toEqual([
      "2026-10-26", "2026-10-28", "2026-10-30", "2026-11-09", "2026-11-11", "2026-11-13",
    ]);
  });


  it("anchors multi-week intervals to Monday calendar weeks for midweek start dates", () => {
    const result = expandRecurringSchedule({
      ...base,
      startsOn: "2026-10-28",
      intervalCount: 2,
      daysOfWeek: [1, 5],
    }, "2026-10-28", "2026-11-16");
    expect(result.map((item) => item.occurrenceDate)).toEqual([
      "2026-10-30", "2026-11-09", "2026-11-13",
    ]);
  });

  it("applies cancellation and override exceptions without mutating the rule", () => {
    const result = expandRecurringSchedule(base, "2026-10-26", "2026-11-02", [
      { occurrenceDate: "2026-10-28", type: "cancelled" },
      { occurrenceDate: "2026-10-30", type: "override", startsAt: "2026-10-30T10:00:00+03:00", endsAt: "2026-10-30T15:00:00+03:00", title: "Adjusted shift" },
    ], "Front desk");
    expect(result).toHaveLength(2);
    expect(result[0].occurrenceDate).toBe("2026-10-26");
    expect(result[1]).toMatchObject({
      occurrenceDate: "2026-10-30",
      localStart: "2026-10-30T10:00:00+03:00",
      localEnd: "2026-10-30T15:00:00+03:00",
      title: "Adjusted shift",
      overridden: true,
    });
  });

  it("rejects invalid intervals, times and weekday definitions", () => {
    expect(() => expandRecurringSchedule({ ...base, intervalCount: 0 }, "2026-10-26", "2026-11-02")).toThrow();
    expect(() => expandRecurringSchedule({ ...base, localEnd: "08:00" }, "2026-10-26", "2026-11-02")).toThrow();
    expect(() => expandRecurringSchedule({ ...base, daysOfWeek: [7] }, "2026-10-26", "2026-11-02")).toThrow();
  });
});
