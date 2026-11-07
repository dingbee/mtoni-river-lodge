import { describe, expect, it } from "vitest";
import { calculateRetryDelaySeconds, classifyProviderFailure } from "./retry";
import { decideInboundEventSequence, buildExternalPriceCommitment } from "./inbound";
import { transitionDistributionException } from "./reconciliation";

describe("distribution reliability contracts", () => {
  it("uses bounded exponential retry and honours provider Retry-After", () => {
    expect(calculateRetryDelaySeconds(1, undefined, 0.5)).toBe(15);
    expect(calculateRetryDelaySeconds(3, undefined, 0.5)).toBe(60);
    expect(calculateRetryDelaySeconds(2, undefined, 0.5, 900)).toBe(900);
    expect(() => calculateRetryDelaySeconds(8)).toThrow(/limit reached/);
  });

  it("dead-letters non-retryable and exhausted operations", () => {
    expect(classifyProviderFailure({ retryable: false, attempt: 1 })).toBe("dead_letter");
    expect(classifyProviderFailure({ retryable: true, attempt: 7 })).toBe("retry");
    expect(classifyProviderFailure({ retryable: true, attempt: 8 })).toBe("dead_letter");
  });

  it("deduplicates and rejects out-of-order inbound events", () => {
    const base = { existingEventId: "evt-2", existingVersion: "2", incomingEventId: "evt-2", incomingVersion: "2", providerSupportsVersioning: true };
    expect(decideInboundEventSequence(base)).toBe("duplicate");
    expect(decideInboundEventSequence({ ...base, incomingEventId: "evt-1", incomingVersion: "1" })).toBe("stale");
    expect(decideInboundEventSequence({ ...base, incomingEventId: "evt-3", incomingVersion: "3" })).toBe("apply");
    expect(decideInboundEventSequence({ ...base, incomingEventId: "evt-3", incomingVersion: null })).toBe("manual_review");
  });

  it("preserves channel-confirmed financial commitments without repricing", () => {
    const commitment = buildExternalPriceCommitment({
      provider: "test.channel", externalAccountId: "acct", externalPropertyId: "prop",
      externalReservationId: "res", eventId: "evt", eventVersion: "1", eventType: "created",
      roomTypeExternalId: "room", ratePlanExternalId: null, arrivalDate: "2026-12-01",
      departureDate: "2026-12-02", adults: 2, children: 0,
      guest: { fullName: "Guest Person", email: null, phone: null },
      confirmedAmountMinor: 12345, currency: "USD", taxAmountMinor: 100,
      feeAmountMinor: 50, commissionAmountMinor: 1000, paymentStatus: "unknown",
      rawPayloadFingerprint: "a".repeat(64),
    });
    expect(commitment.externalConfirmedAmountMinor).toBe(12345);
    expect(commitment.currency).toBe("USD");
    expect(commitment.priceVerificationStatus).toBe("unverified");
  });

  it("requires auditable notes before closing an exception", () => {
    const item = {
      id: "ex-1", tenantId: "tenant", propertyId: "property", connectionId: "connection",
      kind: "pricing_mismatch" as const, status: "open" as const, summary: "Rate differs",
      detectedAt: "2026-11-07T00:00:00.000Z", resolvedAt: null, resolution: null, resolvedBy: null,
    };
    expect(() => transitionDistributionException(item, "resolved", "user-1")).toThrow(/resolution note/);
    const resolved = transitionDistributionException(item, "resolved", "user-1", "Verified provider amount against source booking.");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedBy).toBe("user-1");
    expect(resolved.resolvedAt).not.toBeNull();
  });
});
