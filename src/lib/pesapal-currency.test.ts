import { describe, expect, it } from "vitest";
import { resolvePesapalSettlementCurrency } from "./pesapal-currency";

describe("Pesapal settlement currency verification", () => {
  it("returns the normalized currency when provider and booking match", () => {
    expect(resolvePesapalSettlementCurrency(" usd ", "USD")).toBe("USD");
  });

  it("rejects a missing provider currency instead of inheriting the booking currency", () => {
    expect(resolvePesapalSettlementCurrency(null, "USD")).toBeNull();
    expect(resolvePesapalSettlementCurrency(undefined, "USD")).toBeNull();
    expect(resolvePesapalSettlementCurrency("", "USD")).toBeNull();
  });

  it("rejects a missing booking currency", () => {
    expect(resolvePesapalSettlementCurrency("USD", null)).toBeNull();
    expect(resolvePesapalSettlementCurrency("USD", undefined)).toBeNull();
  });

  it("rejects a currency mismatch", () => {
    expect(resolvePesapalSettlementCurrency("TZS", "USD")).toBeNull();
  });

  it("does not apply a silent USD default", () => {
    expect(resolvePesapalSettlementCurrency(null, null)).toBeNull();
    expect(resolvePesapalSettlementCurrency("TZS", null)).toBeNull();
  });
});
