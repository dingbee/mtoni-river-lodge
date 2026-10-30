import { describe, expect, it } from "vitest";
import { isBookingHoldConsentGranted } from "./booking-hold-policy";

describe("booking hold consent", () => {
  it("accepts an explicit affirmative acknowledgement", () => {
    expect(isBookingHoldConsentGranted(true)).toBe(true);
  });

  it.each([false, undefined, null, "true", 1, {}])("rejects non-affirmative consent: %s", (value) => {
    expect(isBookingHoldConsentGranted(value)).toBe(false);
  });
});
