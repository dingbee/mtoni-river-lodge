import { describe, expect, it } from "vitest";
import { rankCalendarStaff } from "./calendar-scheduling-recommendations";

describe("calendar scheduling recommendations", () => {
  const candidates = [
    { userId: "staff-a", email: "a@example.test" },
    { userId: "staff-b", email: "b@example.test" },
  ];

  it("ranks conflict-free staff before conflicting staff", () => {
    const ranked = rankCalendarStaff(candidates, [
      { id: "event-1", title: "Shift", starts_at: "2026-10-27T09:00:00Z", ends_at: "2026-10-27T12:00:00Z", assignee_id: "staff-a" },
    ], "2026-10-27T10:00:00Z", "2026-10-27T11:00:00Z");
    expect(ranked[0].userId).toBe("staff-b");
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[1].eligible).toBe(false);
    expect(ranked[1].conflictCount).toBe(1);
  });

  it("uses workload as a tie-breaker and ignores cancelled events", () => {
    const ranked = rankCalendarStaff(candidates, [
      { id: "event-1", title: "Old", starts_at: "2026-10-27T07:00:00Z", ends_at: "2026-10-27T08:00:00Z", assignee_id: "staff-a", status: "cancelled" },
      { id: "event-2", title: "Other", starts_at: "2026-10-27T13:00:00Z", ends_at: "2026-10-27T14:00:00Z", assignee_id: "staff-a" },
    ], "2026-10-27T10:00:00Z", "2026-10-27T11:00:00Z");
    expect(ranked[0].userId).toBe("staff-b");
  });

  it("rejects invalid time windows", () => {
    expect(() => rankCalendarStaff(candidates, [], "not-a-date", "2026-10-27T11:00:00Z")).toThrow();
    expect(() => rankCalendarStaff(candidates, [], "2026-10-27T11:00:00Z", "2026-10-27T10:00:00Z")).toThrow();
  });
});
