import { describe, expect, it } from "vitest";
import { isBookingHoldActive, isBookingHoldConsentGranted } from "./booking-hold-policy";

describe("booking hold consent", () => {
  it("accepts an explicit affirmative acknowledgement", () => {
    expect(isBookingHoldConsentGranted(true)).toBe(true);
  });

  it.each([false, undefined, null, "true", 1, {}])("rejects non-affirmative consent: %s", (value) => {
    expect(isBookingHoldConsentGranted(value)).toBe(false);
  });

  it("accepts an unexpired server timestamp", () => {
    expect(isBookingHoldActive("2026-10-30T15:30:00.000Z", Date.parse("2026-10-30T15:15:00.000Z"))).toBe(true);
  });

  it("rejects expired and malformed hold timestamps", () => {
    expect(isBookingHoldActive("2026-10-30T15:00:00.000Z", Date.parse("2026-10-30T15:15:00.000Z"))).toBe(false);
    expect(isBookingHoldActive("not-a-date", Date.parse("2026-10-30T15:15:00.000Z"))).toBe(false);
  });
});
