import { describe, expect, it } from "vitest";
import {
  StayNasPaymentProviderRegistry,
  type StayNasPaymentProviderAdapter,
} from "./provider-adapter.contract";

function adapter(
  scope: "platform_subscription" | "property_guest",
  provider: "mpesa" | "pesapal",
): StayNasPaymentProviderAdapter {
  return {
    scope,
    provider,
    async testConnection() { return { ok: true, message: "verified" }; },
    async initiate() { return { providerOrderReference: "order-1", checkoutUrl: "https://checkout.example.test" }; },
    async query() {
      return {
        providerOrderReference: "order-1",
        providerTransactionReference: "txn-1",
        amountMinor: 10000,
        currency: "TZS",
        status: "successful",
        verifiedAt: "2026-11-08T00:00:00.000Z",
        rawEvidence: { source: "server_query" },
      };
    },
    async verifyWebhook() {
      return {
        providerOrderReference: "order-1",
        providerTransactionReference: "txn-1",
        amountMinor: 10000,
        currency: "TZS",
        status: "successful",
        verifiedAt: "2026-11-08T00:00:00.000Z",
        rawEvidence: { source: "verified_webhook" },
      };
    },
  };
}

describe("StayNas dual-scope payment adapter contract", () => {
  it("keeps platform subscription and property guest adapters separate", () => {
    const registry = new StayNasPaymentProviderRegistry();
    registry.register(adapter("platform_subscription", "pesapal"));
    registry.register(adapter("property_guest", "pesapal"));
    expect(registry.supports("platform_subscription", "pesapal")).toBe(true);
    expect(registry.supports("property_guest", "pesapal")).toBe(true);
    expect(registry.readiness().filter((item) => item.provider === "pesapal" && item.ready)).toHaveLength(2);
  });

  it("fails closed when a provider adapter is not certified for the requested scope", () => {
    const registry = new StayNasPaymentProviderRegistry();
    registry.register(adapter("property_guest", "mpesa"));
    expect(registry.supports("platform_subscription", "mpesa")).toBe(false);
    expect(() => registry.get("platform_subscription", "mpesa")).toThrow(/No certified/);
  });

  it("rejects duplicate scope/provider registrations", () => {
    const registry = new StayNasPaymentProviderRegistry();
    registry.register(adapter("property_guest", "mpesa"));
    expect(() => registry.register(adapter("property_guest", "mpesa"))).toThrow(/already registered/);
  });
});
