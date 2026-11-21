import { describe, expect, it } from "vitest";
import { reconcileQuote } from "./booking-economics";

const plan = { total: 1880000, average_nightly_rate: 235000, currency: "TZS" };

describe("reconcileQuote", () => {
  it("matches when the quote's accommodation equals the searched total in the same currency", () => {
    const result = reconcileQuote(plan, { accommodation_subtotal: 1880000, total: 1880000, currency: "TZS" });
    expect(result.matches).toBe(true);
    expect(result.noAdditionalCharges).toBe(true);
  });

  it("flags a rate change between search and checkout", () => {
    const result = reconcileQuote(plan, { accommodation_subtotal: 2000000, total: 2000000, currency: "TZS" });
    expect(result.matches).toBe(false);
    expect([result.searched, result.quoted]).toEqual([1880000, 2000000]);
  });

  it("flags a currency mismatch even when the numbers agree", () => {
    expect(reconcileQuote(plan, { accommodation_subtotal: 1880000, total: 1880000, currency: "USD" }).matches).toBe(false);
  });

  it("never treats a missing or zero amount as a match", () => {
    expect(reconcileQuote(plan, { accommodation_subtotal: null, total: 0, currency: "TZS" }).matches).toBe(false);
    expect(reconcileQuote({ ...plan, total: 0 }, { accommodation_subtotal: 0, total: 0, currency: "TZS" }).matches).toBe(false);
  });

  it("reports when taxes, fees, extras or discounts apply", () => {
    expect(reconcileQuote(plan, { accommodation_subtotal: 1880000, fee_total: 20000, total: 1900000, currency: "TZS" }).noAdditionalCharges).toBe(false);
    expect(reconcileQuote(plan, { accommodation_subtotal: 1880000, taxes: 286780, total: 1880000, currency: "TZS" }).noAdditionalCharges).toBe(false);
  });
});
