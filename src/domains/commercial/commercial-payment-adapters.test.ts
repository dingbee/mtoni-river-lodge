import { describe, expect, it } from "vitest";
import { CommercialPaymentAdapterRegistry, type CommercialPaymentProviderAdapter } from "./commercial-payment-adapters";
import { pesapalMajorAmountToMinor } from "./commercial-pesapal.server";

const adapter: CommercialPaymentProviderAdapter = {
  provider: "pesapal",
  async initiate() { return { providerOrderRef: "order-1", redirectUrl: "https://example.invalid" }; },
  async query() { return { providerOrderRef: "order-1", providerTransactionRef: "txn-1", amountMinor: 100, currency: "TZS", status: "successful", verifiedAt: "2026-11-07T00:00:00Z" }; },
};

describe("commercial provider adapter registry", () => {
  it("registers explicit provider adapters", () => {
    const registry = new CommercialPaymentAdapterRegistry();
    registry.register(adapter);
    expect(registry.supports("pesapal")).toBe(true);
    expect(registry.supports("airtel_money")).toBe(false);
  });
  it("fails closed for unconfigured provider integrations", () => {
    expect(() => new CommercialPaymentAdapterRegistry().get("mpesa")).toThrow(/No approved live adapter/);
  });
});


describe("Pesapal amount normalization", () => {
  it("converts valid major-unit amounts to exact minor units", () => {
    expect(pesapalMajorAmountToMinor("1250")).toBe(125000n);
    expect(pesapalMajorAmountToMinor("1250.4")).toBe(125040n);
    expect(pesapalMajorAmountToMinor("1250.40")).toBe(125040n);
  });
  it("rejects malformed or over-precision provider amounts", () => {
    expect(pesapalMajorAmountToMinor("12.345")).toBeNull();
    expect(pesapalMajorAmountToMinor("1,250.00")).toBeNull();
    expect(pesapalMajorAmountToMinor("")).toBeNull();
  });
});
