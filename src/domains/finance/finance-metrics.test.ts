import { describe, expect, it } from "vitest";
import { deriveOutstandingBalance, hasBalanceMismatch, sumByCurrency } from "./finance-metrics";

describe("finance currency and balance metrics", () => {
  it("keeps unlike currencies in separate totals", () => {
    const totals = sumByCurrency([
      { currency: "USD", total: 120, status: "confirmed" },
      { currency: "TZS", total: 250000, status: "confirmed" },
      { currency: "usd", total: "30.50", status: "confirmed" },
    ]);
    expect(totals.get("USD")).toBe(150.5);
    expect(totals.get("TZS")).toBe(250000);
    expect(totals.size).toBe(2);
  });

  it("excludes cancelled bookings from revenue totals", () => {
    const totals = sumByCurrency([
      { currency: "USD", total: 100, status: "cancelled" },
      { currency: "USD", total: 80, status: "confirmed" },
    ]);
    expect(totals.get("USD")).toBe(80);
  });

  it("derives outstanding balance without allowing a negative balance", () => {
    expect(deriveOutstandingBalance(120, 40)).toBe(80);
    expect(deriveOutstandingBalance(120, 150)).toBe(0);
    expect(deriveOutstandingBalance(120, null)).toBe(120);
  });

  it("detects material differences but tolerates rounding noise", () => {
    expect(hasBalanceMismatch(79.995, 80)).toBe(false);
    expect(hasBalanceMismatch(70, 80)).toBe(true);
  });
});
