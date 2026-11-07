import { describe, expect, it, vi } from "vitest";
import { applyInboundReservationEvent, type CanonicalReservationWriter } from "./canonical-reservation";

const event = {
  provider: "test-provider", externalAccountId: "acct", externalPropertyId: "prop",
  externalReservationId: "external-booking-1", eventId: "event-1", eventVersion: "1",
  eventType: "created" as const, roomTypeExternalId: "room-external",
  ratePlanExternalId: "rate-external", arrivalDate: "2026-12-01",
  departureDate: "2026-12-03", adults: 2, children: 0,
  guest: { fullName: "Test Guest", email: null, phone: null },
  confirmedAmountMinor: 250000, currency: "TZS", taxAmountMinor: 25000,
  feeAmountMinor: 0, commissionAmountMinor: 12500, paymentStatus: "unpaid" as const,
  rawPayloadFingerprint: "a".repeat(64),
};

describe("canonical reservation boundary", () => {
  it("blocks an unverified provider price before canonical create", async () => {
    const writer: CanonicalReservationWriter = {
      create: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-id" })),
      modify: vi.fn(), cancel: vi.fn(),
    };
    const result = await applyInboundReservationEvent(event, writer);
    expect(result).toEqual({ status: "manual_review", reason: "Provider price has not passed verification; automatic booking creation or modification is prohibited." });
    expect(writer.create).not.toHaveBeenCalled();
  });

  it("routes missing provider price to manual review", async () => {
    const writer: CanonicalReservationWriter = {
      create: vi.fn(), modify: vi.fn(), cancel: vi.fn(),
    };
    const result = await applyInboundReservationEvent({
      ...event, confirmedAmountMinor: null, currency: null,
    }, writer);
    expect(result.status).toBe("manual_review");
    expect(writer.create).not.toHaveBeenCalled();
  });

  it("routes modifications and cancellations to distinct canonical commands", async () => {
    const writer: CanonicalReservationWriter = {
      create: vi.fn(), modify: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-id" })),
      cancel: vi.fn(async () => ({ status: "applied" as const, bookingId: "booking-id" })),
    };
    await applyInboundReservationEvent({ ...event, eventType: "modified" }, writer);
    await applyInboundReservationEvent({ ...event, eventType: "cancelled" }, writer);
    expect(writer.modify).toHaveBeenCalledTimes(1);
    expect(writer.cancel).toHaveBeenCalledTimes(1);
    expect(writer.create).not.toHaveBeenCalled();
  });
});
