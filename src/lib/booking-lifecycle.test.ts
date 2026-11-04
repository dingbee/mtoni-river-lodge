import { describe, expect, it } from "vitest";
import {
  canTransitionBooking,
  getAllowedBookingTransitions,
  type BookingLifecycleStatus,
} from "./booking-lifecycle";

describe("booking lifecycle transition contract", () => {
  it("allows only the defined forward transitions", () => {
    const allowed: Array<[BookingLifecycleStatus, BookingLifecycleStatus]> = [
      ["pending", "confirmed"],
      ["pending", "cancelled"],
      ["confirmed", "checked_in"],
      ["confirmed", "cancelled"],
      ["confirmed", "no_show"],
      ["checked_in", "completed"],
    ];

    for (const [from, to] of allowed) {
      expect(canTransitionBooking(from, to)).toBe(true);
    }
  });

  it("rejects skipped, reversed, and terminal-state transitions", () => {
    const rejected: Array<[BookingLifecycleStatus, BookingLifecycleStatus]> = [
      ["pending", "checked_in"],
      ["pending", "completed"],
      ["confirmed", "completed"],
      ["checked_in", "cancelled"],
      ["checked_in", "no_show"],
      ["completed", "confirmed"],
      ["cancelled", "confirmed"],
      ["no_show", "checked_in"],
    ];

    for (const [from, to] of rejected) {
      expect(canTransitionBooking(from, to)).toBe(false);
    }
  });

  it("exposes no actions for terminal states", () => {
    expect(getAllowedBookingTransitions("completed")).toEqual([]);
    expect(getAllowedBookingTransitions("cancelled")).toEqual([]);
    expect(getAllowedBookingTransitions("no_show")).toEqual([]);
  });
});
