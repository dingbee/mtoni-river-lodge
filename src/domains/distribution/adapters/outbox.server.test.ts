import { describe, expect, it } from "vitest";
import { validateDistributionOutboxPayload } from "./outbox.server";

describe("distribution outbox payload safety", () => {
  it("accepts non-sensitive operational references", () => {
    expect(() => validateDistributionOutboxPayload({
      externalReservationId: "provider-reservation-123",
      staynasBookingId: "booking-reference-123",
      arrivalDate: "2027-01-01",
    })).not.toThrow();
  });

  it("rejects guest/contact keys and sensitive values", () => {
    expect(() => validateDistributionOutboxPayload({
      guest: { firstName: "Guest" },
    })).toThrow("prohibited sensitive field");
    expect(() => validateDistributionOutboxPayload({
      note: "Please email guest@example.test",
    })).toThrow("sensitive value");
    expect(() => validateDistributionOutboxPayload({
      note: "Bearer abcdefghijklmnopqrstuvwxyz123456",
    })).toThrow("sensitive value");
  });

  it("rejects oversized strings and non-finite numbers", () => {
    expect(() => validateDistributionOutboxPayload({ note: "x".repeat(2049) }))
      .toThrow("safe length limit");
    expect(() => validateDistributionOutboxPayload({ count: Number.POSITIVE_INFINITY }))
      .toThrow("non-finite number");
  });
});
