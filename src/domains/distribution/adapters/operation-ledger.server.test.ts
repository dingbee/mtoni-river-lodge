import { describe, expect, it } from "vitest";
import {
  fingerprintDistributionPayload,
  validateDistributionOperationEnvelope,
} from "./operation-ledger.server";

describe("distribution operation ledger envelope", () => {
  it("fingerprints equivalent JSON payloads deterministically", () => {
    expect(fingerprintDistributionPayload({ b: 2, a: 1 }))
      .toBe(fingerprintDistributionPayload({ a: 1, b: 2 }));
  });

  it("changes fingerprint when the canonical request changes", () => {
    expect(fingerprintDistributionPayload({ room: "A", date: "2027-01-01" }))
      .not.toBe(fingerprintDistributionPayload({ room: "B", date: "2027-01-01" }));
  });

  it("rejects credential and direct guest contact fields from durable payloads", () => {
    expect(() => validateDistributionOperationEnvelope("idem-key-0001", {
      externalReference: "reservation-1",
      api_key: "must-not-persist",
    })).toThrow("prohibited sensitive field");
    expect(() => validateDistributionOperationEnvelope("idem-key-0002", {
      guest_email: "guest@example.test",
    })).toThrow("prohibited sensitive field");
  });

  it("rejects weak idempotency keys", () => {
    expect(() => validateDistributionOperationEnvelope("short", { bookingId: "booking-1" }))
      .toThrow("8 to 128 characters");
  });
});
