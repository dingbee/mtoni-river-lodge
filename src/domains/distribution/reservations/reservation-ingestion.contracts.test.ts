import { describe, expect, it } from "vitest";
import { externalReservationSchema, isNewerProviderEvent, toSafeReservationEventEnvelope } from "./reservation-ingestion.contracts";

const base = {
  providerKey: "airbnb", externalAccountReference: "account-1", externalReservationId: "reservation-1",
  externalListingId: "listing-1", providerEventId: "event-1", eventType: "reservation.created",
  providerStatus: "confirmed", arrivalDate: "2026-12-01", departureDate: "2026-12-04",
  adults: 2, children: 1, grossAmount: 900, originalCurrency: "USD", taxes: 90,
  fees: 10, channelCommission: 135, expectedSettlement: 765, providerPayloadFingerprint: "a".repeat(64),
};

describe("DC-05 provider-neutral reservation contract", () => {
  it("accepts valid data without optional guest contact", () => {
    expect(externalReservationSchema.parse(base).guest).toEqual({});
  });
  it("validates real calendar dates", () => {
    expect(externalReservationSchema.parse(base).arrivalDate).toBe("2026-12-01");
    expect(() => externalReservationSchema.parse({ ...base, arrivalDate: "2026-2-01" })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, arrivalDate: "2026-02-30" })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, departureDate: base.arrivalDate })).toThrow();
  });
  it("requires original currency for financial values", () => {
    expect(() => externalReservationSchema.parse({ ...base, originalCurrency: undefined })).toThrow();
  });
  it("rejects malformed currency, negative money and empty event identity", () => {
    expect(() => externalReservationSchema.parse({ ...base, originalCurrency: "USD " })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, grossAmount: -1 })).toThrow();
    expect(() => externalReservationSchema.parse({ ...base, providerEventId: "" })).toThrow();
  });
  it("rejects older provider modifications", () => {
    expect(isNewerProviderEvent(
      { providerStatus: "cancelled", providerModifiedAt: "2026-11-03T10:00:00Z", providerEventId: "e2" },
      { providerStatus: "confirmed", providerModifiedAt: "2026-11-04T10:00:00Z", providerEventId: "e1" },
    )).toBe(false);
  });
  it("accepts only strictly newer timestamps when both events are comparable", () => {
    const current = { providerStatus: "confirmed", providerModifiedAt: "2026-11-04T10:00:00Z", providerEventId: "e1" };
    expect(isNewerProviderEvent(
      { providerStatus: "cancelled", providerModifiedAt: "2026-11-05T10:00:00Z", providerEventId: "e2" },
      current,
    )).toBe(true);
    expect(isNewerProviderEvent(
      { providerStatus: "cancelled", providerModifiedAt: "2026-11-04T10:00:00Z", providerEventId: "e3" },
      current,
    )).toBe(false);
  });
  it("fails closed when either event lacks a comparable timestamp", () => {
    expect(isNewerProviderEvent(
      { providerStatus: "cancelled", providerModifiedAt: null, providerEventId: "event-99" },
      { providerStatus: "confirmed", providerModifiedAt: null, providerEventId: "event-1" },
    )).toBe(false);
    expect(isNewerProviderEvent(
      { providerStatus: "cancelled", providerModifiedAt: "2026-11-05T10:00:00Z", providerEventId: "event-2" },
      { providerStatus: "confirmed", providerModifiedAt: null, providerEventId: "event-1" },
    )).toBe(false);
  });
  it("excludes guest and financial details from the adapter inbox envelope", () => {
    const event = externalReservationSchema.parse({ ...base, guest: { firstName: "Test", email: "guest@example.com" } });
    const safe = toSafeReservationEventEnvelope(event);
    expect(safe).not.toHaveProperty("guest");
    expect(safe).not.toHaveProperty("grossAmount");
    expect(safe.privateFieldsPresent).toBe(true);
    expect(safe.hasFinancialData).toBe(true);
  });
  it("flags tax-only events as financial data", () => {
    const event = externalReservationSchema.parse({ ...base, grossAmount: undefined, taxes: 12 });
    expect(toSafeReservationEventEnvelope(event).hasFinancialData).toBe(true);
  });
});
