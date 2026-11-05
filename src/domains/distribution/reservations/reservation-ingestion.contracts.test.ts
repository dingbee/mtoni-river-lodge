import { describe, expect, it } from "vitest";
import {
  externalReservationSchema,
  isNewerProviderEvent,
  toSafeReservationEventEnvelope,
} from "./reservation-ingestion.contracts";

const base = {
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  providerEventId: "event-1",
  eventType: "reservation.created",
  providerStatus: "confirmed",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-04",
  adults: 2,
  children: 1,
  grossAmount: 900,
  originalCurrency: "USD",
  taxes: 90,
  fees: 10,
  channelCommission: 135,
  expectedSettlement: 765,
  providerPayloadFingerprint: "a".repeat(64),
};

describe("DC-05 provider-neutral reservation contract", () => {
  it("accepts valid provider data without inventing optional guest contact", () => {
    expect(externalReservationSchema.parse(base).guest).toEqual({});
  });

  it("rejects invalid date boundaries and missing financial currency", () => {
    expect(() => externalReservationSchema.parse({ ...base, departureDate: base.arrivalDate })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, originalCurrency: undefined })).toThrow();
  });

  it("rejects malformed currency, money and event identity", () => {
    expect(() => externalReservationSchema.parse({ ...base, originalCurrency: "USD " })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, grossAmount: -1 })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, providerEventId: "" })).toThrow();
  });

  it("does not allow older provider modifications to replace newer state", () => {
    expect(isNewerProviderEvent(
      { providerStatus: "cancelled", providerModifiedAt: "2026-11-03T10:00:00Z", providerEventId: "e2" },
      { providerStatus: "confirmed", providerModifiedAt: "2026-11-04T10:00:00Z", providerEventId: "e1" },
    )).toBe(false);
  });

  it("keeps guest contact and financial values out of the adapter inbox envelope", () => {
    const event = externalReservationSchema.parse({ ...base, guest: { email: "guest@example.com", phone: "+255700000000" } });
    const safe = toSafeReservationEventEnvelope(event);
    expect(safe).not.toHaveProperty("guest");
    expect(safe).not.toHaveProperty("grossAmount");
    expect(safe.privateFieldsPresent).toBe(true);
    expect(safe.hasFinancialData).toBe(true);
  });
});
