import { describe, expect, it, vi } from "vitest";
import { runReservationInboxBatch } from "./reservation-worker";
import type { CanonicalReservationWriter } from "./canonical-reservation";

const baseEvent = {
  provider: "test-provider", externalAccountId: "account", externalPropertyId: "property",
  externalReservationId: "external-1", eventId: "event-1", eventVersion: "1",
  eventType: "created", roomTypeExternalId: "room", ratePlanExternalId: "rate",
  arrivalDate: "2026-12-01", departureDate: "2026-12-02", adults: 2, children: 0,
  guest: { fullName: "Guest Person", email: null, phone: null },
  confirmedAmountMinor: 10000, currency: "TZS", taxAmountMinor: 1000,
  feeAmountMinor: 0, commissionAmountMinor: 500, paymentStatus: "unpaid",
  rawPayloadFingerprint: "b".repeat(64),
};

describe("reservation inbox worker", () => {
  it("routes create, modify and cancel through canonical commands", async () => {
    const writer: CanonicalReservationWriter = {
      create: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-1" })),
      modify: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-1" })),
      cancel: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-1" })),
    };
    const items = ["created", "modified", "cancelled"].map((eventType, index) => ({
      inboxId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      leaseToken: `00000000-0000-4000-8000-00000000001${index + 1}`,
      organisationId: "00000000-0000-4000-8000-000000000004",
      propertyId: "00000000-0000-4000-8000-000000000005",
      connectionId: "00000000-0000-4000-8000-000000000006",
      providerEventId: `event-${index}`, attempt: 1,
      normalizedPayload: { ...baseEvent, eventType },
    }));
    const finish = vi.fn(async () => true);
    const recordPriceCommitment = vi.fn(async (inboxId: string) => `commitment-${inboxId}`);
    const report = await runReservationInboxBatch({
      claim: vi.fn(async () => items), finish, writer, recordPriceCommitment,
    });
    expect(report.applied).toBe(1);
    expect(report.manualReview).toBe(2);
    expect(writer.create).not.toHaveBeenCalled();
    expect(writer.modify).not.toHaveBeenCalled();
    expect(writer.cancel).toHaveBeenCalledTimes(1);
    expect(recordPriceCommitment).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenCalledTimes(3);
  });

  it("does not report an applied event when its lease is stale", async () => {
    const writer: CanonicalReservationWriter = {
      create: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-1" })),
      modify: vi.fn(), cancel: vi.fn(),
    };
    const report = await runReservationInboxBatch({
      claim: vi.fn(async () => [{
        inboxId: "00000000-0000-4000-8000-000000000001",
        leaseToken: "00000000-0000-4000-8000-000000000002",
        organisationId: "00000000-0000-4000-8000-000000000004",
        propertyId: "00000000-0000-4000-8000-000000000005",
        connectionId: "00000000-0000-4000-8000-000000000006",
        providerEventId: "event", attempt: 1, normalizedPayload: baseEvent,
      }]),
      finish: vi.fn(async () => false), writer,
      recordPriceCommitment: vi.fn(async () => "commitment-id"),
      isPriceCommitmentVerified: vi.fn(async () => false),
    });
    expect(report.leaseLost).toBe(1);
    expect(report.applied).toBe(0);
  });
});
