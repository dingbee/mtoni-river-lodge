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

  it("requires both child age bands and exact reconciliation to the provider total", () => {
    expect(() => externalReservationSchema.parse({
      ...base, children: 2, childrenBelow6: 1,
    })).toThrow();
    expect(() => externalReservationSchema.parse({
      ...base, children: 2, childrenBelow6: 1, children7Plus: 0,
    })).toThrow();
    expect(externalReservationSchema.parse({
      ...base, children: 2, childrenBelow6: 1, children7Plus: 1,
    }).children).toBe(2);
  });
  it("keeps child age pricing inputs in the encrypted-event contract and safe numeric envelope", () => {
    const event = externalReservationSchema.parse({
      ...base, children: 2, childrenBelow6: 1, children7Plus: 1,
    });
    const safe = toSafeReservationEventEnvelope(event);
    expect(safe.childrenBelow6).toBe(1);
    expect(safe.children7Plus).toBe(1);
    expect(safe).not.toHaveProperty("guest");
    expect(safe).not.toHaveProperty("grossAmount");
  });

  it("accepts partial settlement evidence and retains missing FX as a reconcilable discrepancy", () => {
    const event = externalReservationSchema.parse({
      ...base,
      eventType: "reservation.settlement_reported",
      providerEventId: "settlement-event-1",
      settlementReference: "settlement-1",
      settlementAmount: 400,
      settlementCurrency: "EUR",
      settlementDueAt: "2026-11-10T00:00:00Z",
    });
    expect(event.settlementAmount).toBe(400);
    expect(toSafeReservationEventEnvelope(event).hasFinancialData).toBe(true);
    expect(toSafeReservationEventEnvelope(event)).not.toHaveProperty("settlementAmount");
  });

  it("requires settlement adjustment direction and a provider settlement reference", () => {
    expect(() => externalReservationSchema.parse({
      ...base,
      eventType: "reservation.settlement_adjusted",
      settlementAmount: 25,
      settlementCurrency: "USD",
      settlementReference: "settlement-1",
    })).toThrow();
    expect(externalReservationSchema.parse({
      ...base,
      eventType: "reservation.settlement_adjusted",
      settlementAmount: 25,
      settlementCurrency: "USD",
      settlementReference: "settlement-1",
      settlementAdjustmentType: "debit",
    }).settlementAdjustmentType).toBe("debit");
  });

  it("requires provider references and currencies for refunds and reversals", () => {
    expect(() => externalReservationSchema.parse({
      ...base, eventType: "reservation.refund_notified", refundAmount: 50,
    })).toThrow();
    expect(externalReservationSchema.parse({
      ...base, eventType: "reservation.refund_notified",
      refundAmount: 50, refundCurrency: "USD", refundReference: "refund-1",
    }).refundAmount).toBe(50);
    expect(() => externalReservationSchema.parse({
      ...base, eventType: "reservation.refund_reversed",
      refundReversalAmount: 50, refundCurrency: "USD",
    })).toThrow();
    expect(externalReservationSchema.parse({
      ...base, eventType: "reservation.refund_reversed",
      refundReversalAmount: 50, refundCurrency: "USD",
      refundReversalReference: "refund-reversal-1",
    }).refundReversalReference).toBe("refund-reversal-1");
  });

  it("requires a provider payment status without promoting it to a payment record", () => {
    expect(() => externalReservationSchema.parse({
      ...base, eventType: "reservation.payment_updated",
    })).toThrow();
    const event = externalReservationSchema.parse({
      ...base, eventType: "reservation.payment_updated",
      paymentStatus: "captured", paymentAmount: 900, paymentCurrency: "USD",
    });
    const safe = toSafeReservationEventEnvelope(event);
    expect(safe.hasFinancialData).toBe(true);
    expect(safe).not.toHaveProperty("paymentAmount");
    expect(safe).not.toHaveProperty("paymentStatus");
  });
});
