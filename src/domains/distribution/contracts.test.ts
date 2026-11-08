import { describe, expect, it } from "vitest";
import {
  distributionAvailabilitySchema,
  inboundReservationSchema,
  providerCapabilitiesSchema,
} from "./contracts";
import { assertAdapterContract } from "./provider";
import { requireExactMapping, validateMappingSet } from "./mapping";
import { payloadFingerprint } from "./engine";

const scope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  propertyId: "22222222-2222-4222-8222-222222222222",
  connectionId: "33333333-3333-4333-8333-333333333333",
};

describe("distribution contracts", () => {
  it("rejects availability that exceeds physical inventory", () => {
    expect(distributionAvailabilitySchema.safeParse({
      roomTypeId: scope.propertyId,
      stayDate: "2026-12-01",
      totalUnits: 4,
      reservedUnits: 2,
      blockedUnits: 1,
      allocatedUnits: 2,
      stopSell: false,
      sourceVersion: "inventory-v1",
    }).success).toBe(false);
  });

  it("requires a confirmed amount to carry a currency and preserves it as an integer minor-unit value", () => {
    const parsed = inboundReservationSchema.safeParse({
      provider: "test.provider",
      externalAccountId: "acct-1",
      externalPropertyId: "prop-1",
      externalReservationId: "booking-1",
      eventId: "event-1",
      eventVersion: "2",
      eventType: "created",
      roomTypeExternalId: "room-1",
      ratePlanExternalId: "rate-1",
      arrivalDate: "2026-12-01",
      departureDate: "2026-12-03",
      adults: 2,
      children: 0,
      guest: { fullName: "Test Guest", email: null, phone: null },
      confirmedAmountMinor: 52000,
      currency: "USD",
      taxAmountMinor: null,
      feeAmountMinor: null,
      commissionAmountMinor: null,
      paymentStatus: "unknown",
      rawPayloadFingerprint: "a".repeat(64),
    });
    expect(parsed.success).toBe(true);
    expect(inboundReservationSchema.safeParse({
      provider: "test.provider",
      externalAccountId: "acct-1",
      externalPropertyId: "prop-1",
      externalReservationId: "booking-1",
      eventId: "event-1",
      eventVersion: null,
      eventType: "created",
      roomTypeExternalId: "room-1",
      ratePlanExternalId: null,
      arrivalDate: "2026-12-01",
      departureDate: "2026-12-03",
      adults: 2,
      children: 0,
      guest: { fullName: "Test Guest", email: null, phone: null },
      confirmedAmountMinor: 52000,
      currency: null,
      taxAmountMinor: null,
      feeAmountMinor: null,
      commissionAmountMinor: null,
      rawPayloadFingerprint: "a".repeat(64),
    }).success).toBe(false);
  });


  it("accepts multi-room allocations only when their amounts reconcile exactly", () => {
    const multiRoom = {
      provider: "test.provider",
      externalAccountId: "acct-1",
      externalPropertyId: "prop-1",
      externalReservationId: "booking-multi",
      eventId: "event-multi",
      eventVersion: "3",
      eventType: "created",
      roomTypeExternalId: "room-1",
      ratePlanExternalId: "rate-1",
      arrivalDate: "2026-12-01",
      departureDate: "2026-12-04",
      adults: 3,
      children: 1,
      guest: { fullName: "Test Guest", email: "guest@example.com", phone: null },
      confirmedAmountMinor: 30000,
      currency: "USD",
      taxAmountMinor: null,
      feeAmountMinor: null,
      commissionAmountMinor: null,
      paymentStatus: "unpaid",
      rawPayloadFingerprint: "c".repeat(64),
      allocations: [
        { externalAllocationId: "line-1", roomTypeExternalId: "room-1", arrivalDate: "2026-12-01", departureDate: "2026-12-04", adults: 2, children: 0, confirmedAmountMinor: 18000 },
        { externalAllocationId: "line-2", roomTypeExternalId: "room-2", arrivalDate: "2026-12-01", departureDate: "2026-12-04", adults: 1, children: 1, confirmedAmountMinor: 12000 },
      ],
    };
    expect(inboundReservationSchema.safeParse(multiRoom).success).toBe(true);
    expect(inboundReservationSchema.safeParse({
      ...multiRoom,
      allocations: multiRoom.allocations.map((line, index) => ({ ...line, externalAllocationId: index ? "line-1" : "line-1" })),
    }).success).toBe(false);
    expect(inboundReservationSchema.safeParse({
      ...multiRoom,
      allocations: multiRoom.allocations.map((line) => ({ ...line, confirmedAmountMinor: line.confirmedAmountMinor + 1 })),
    }).success).toBe(false);
  });

  it("rejects unsupported operations advertised without a provider method", () => {
    const adapter = {
      id: "test.provider",
      discoverCapabilities: async () => capabilities,
      validateConnection: async () => ({
        connected: true, externalAccountId: "a", externalPropertyId: "p",
        checkedAt: new Date().toISOString(), errorCode: null, safeMessage: null,
      }),
    };
    const capabilities = providerCapabilitiesSchema.parse({
      operations: ["connection.validate", "rates.push"],
      restrictions: [],
      supportsOccupancyPricing: false,
      supportsTaxBreakdown: false,
      supportsFeeBreakdown: false,
      supportsCurrencyConversion: false,
      reservationDelivery: "none",
      supportsEventVersioning: false,
      supportsExternalIdempotency: false,
    });
    expect(() => assertAdapterContract(adapter, capabilities)).toThrow(/without implementing/);
  });

  it("rejects duplicate and cross-scope mapping ambiguity", () => {
    const mapping = { ...scope, mappingType: "room_type" as const, internalId: scope.propertyId, externalId: "room-a", active: true };
    expect(() => validateMappingSet([mapping, mapping])).toThrow(/more than one active mapping/);
    expect(() => requireExactMapping([mapping], { ...scope, propertyId: "44444444-4444-4444-8444-444444444444", mappingType: "room_type" }, scope.propertyId)).toThrow(/No active external mapping/);
  });

  it("creates a stable fingerprint independent of object key order", () => {
    expect(payloadFingerprint({ b: 2, a: 1 })).toBe(payloadFingerprint({ a: 1, b: 2 }));
  });
});
