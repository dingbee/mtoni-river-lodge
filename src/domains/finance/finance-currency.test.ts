import { describe, expect, it } from "vitest";
import { moneyByCurrency, sumCurrency } from "./finance-currency";

describe("finance currency aggregation", () => {
  it("keeps monetary totals isolated by currency", () => {
    const result = moneyByCurrency(
      [
        { currency: "USD", total: 120 },
        { currency: "TZS", total: 250000 },
        { currency: "USD", total: 30 },
      ],
      (row) => row.total,
    );
    expect(result).toEqual([
      { currency: "USD", amount: 150 },
      { currency: "TZS", amount: 250000 },
    ]);
  });

  it("normalizes missing currency into an explicit UNKNOWN bucket", () => {
    expect(sumCurrency([
      { currency: null, amount: 10 },
      { currency: "USD", amount: "5" },
    ])).toEqual([
      { currency: "UNKNOWN", amount: 10 },
      { currency: "USD", amount: 5 },
    ]);
  });

  it("does not silently merge currencies when refunds are grouped", () => {
    expect(sumCurrency([
      { currency: "USD", amount: 12 },
      { currency: "TZS", amount: 12000 },
      { currency: "USD", amount: 3 },
    ])).toEqual([
      { currency: "USD", amount: 15 },
      { currency: "TZS", amount: 12000 },
    ]);
  });
});
