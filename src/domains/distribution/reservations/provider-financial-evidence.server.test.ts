import { describe, expect, it } from "vitest";
import { externalReservationSchema } from "./reservation-ingestion.contracts";
import { buildProviderFinancialEvidence } from "./provider-financial-evidence.server";

const base = {
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  providerEventId: "finance-event-1",
  eventType: "reservation.payment_updated" as const,
  providerStatus: "confirmed",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-03",
  adults: 2,
  originalCurrency: "USD",
  paymentAmount: 500,
  paymentCurrency: "USD",
  paymentStatus: "captured" as const,
  paymentReference: "pay-1",
  providerPayloadFingerprint: "a".repeat(64),
};

describe("DC-05.06 provider financial evidence", () => {
  it("extracts only modeled financial fields", () => {
    const event = externalReservationSchema.parse({
      ...base,
      guest: { firstName: "Private", email: "private@example.com" },
    });
    const evidence = buildProviderFinancialEvidence(event);
    expect(evidence).toMatchObject({
      paymentAmount: 500,
      paymentCurrency: "USD",
      paymentStatus: "captured",
      paymentReference: "pay-1",
    });
    expect(evidence).not.toHaveProperty("guest");
    expect(evidence).not.toHaveProperty("externalReservationId");
    expect(evidence).not.toHaveProperty("providerPayloadFingerprint");
  });

  it("retains settlement evidence including foreign currency and FX", () => {
    const event = externalReservationSchema.parse({
      ...base,
      eventType: "reservation.settlement_reported",
      providerEventId: "settlement-event-1",
      settlementReference: "settlement-1",
      settlementAmount: 420,
      settlementCurrency: "EUR",
      exchangeRate: 0.92,
    });
    expect(buildProviderFinancialEvidence(event)).toMatchObject({
      originalCurrency: "USD",
      settlementAmount: 420,
      settlementCurrency: "EUR",
      exchangeRate: 0.92,
    });
  });

  it("retains refunds and refund reversals as evidence only", () => {
    const refund = externalReservationSchema.parse({
      ...base,
      eventType: "reservation.refund_notified",
      refundAmount: 50,
      refundCurrency: "USD",
      refundReference: "refund-1",
    });
    const reversal = externalReservationSchema.parse({
      ...base,
      eventType: "reservation.refund_reversed",
      refundReversalAmount: 50,
      refundCurrency: "USD",
      refundReversalReference: "refund-reversal-1",
    });
    expect(buildProviderFinancialEvidence(refund)).toHaveProperty("refundReference", "refund-1");
    expect(buildProviderFinancialEvidence(reversal)).toHaveProperty("refundReversalReference", "refund-reversal-1");
  });

  it("rejects lifecycle events and evidence-free payment callbacks", () => {
    const lifecycle = externalReservationSchema.parse({ ...base, eventType: "reservation.modified" });
    expect(() => buildProviderFinancialEvidence(lifecycle)).toThrow();
    const noMoney = externalReservationSchema.parse({
      ...base,
      eventType: "reservation.payment_updated",
      paymentAmount: undefined,
      paymentCurrency: undefined,
      paymentStatus: undefined,
      paymentReference: undefined,
    });
    expect(() => buildProviderFinancialEvidence(noMoney)).toThrow();
  });
});
