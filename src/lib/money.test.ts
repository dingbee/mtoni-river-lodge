import { describe, expect, it } from "vitest";
import {
  addMoney,
  assertCurrencyCode,
  currencyMinorUnits,
  formatMoney,
  isIsoCurrencyCode,
  money,
  MoneyError,
  toMinorUnits,
  totalsByCurrency,
} from "./money";

describe("ISO 4217 currency identity", () => {
  it("accepts ISO codes and rejects symbols or malformed codes", () => {
    expect(isIsoCurrencyCode("TZS")).toBe(true);
    expect(isIsoCurrencyCode("USD")).toBe(true);
    expect(isIsoCurrencyCode("$")).toBe(false);
    expect(isIsoCurrencyCode("TSh")).toBe(false);
    expect(isIsoCurrencyCode("tzs")).toBe(false);
    expect(isIsoCurrencyCode("ZZZ")).toBe(false);
    expect(assertCurrencyCode(" tzs ")).toBe("TZS");
    expect(() => assertCurrencyCode("")).toThrow(MoneyError);
  });

  it("uses each currency's ISO minor units instead of assuming two decimals", () => {
    expect(currencyMinorUnits("TZS")).toBe(2);
    expect(currencyMinorUnits("USD")).toBe(2);
    expect(currencyMinorUnits("JPY")).toBe(0);
    expect(currencyMinorUnits("KWD")).toBe(3);
  });
});

describe("decimal-safe arithmetic", () => {
  it("converts to exact minor units", () => {
    expect(toMinorUnits(125000, "TZS")).toBe(12500000n);
    expect(toMinorUnits("125000.00", "TZS")).toBe(12500000n);
    expect(toMinorUnits("0.1", "USD")).toBe(10n);
    expect(toMinorUnits("1.234", "KWD")).toBe(1234n);
    expect(toMinorUnits(-12.5, "USD")).toBe(-1250n);
  });

  it("rejects precision the currency does not have rather than rounding it", () => {
    expect(() => toMinorUnits("125.5", "JPY")).toThrow(MoneyError);
    expect(() => toMinorUnits("10.001", "USD")).toThrow(MoneyError);
    expect(toMinorUnits("125.00", "JPY")).toBe(125n);
  });

  it("adds without binary floating point drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney([{ amount: 0.1, currency: "USD" }, { amount: 0.2, currency: "USD" }], "USD").amount).toBe("0.30");
    expect(addMoney([{ amount: "125000", currency: "TZS" }, { amount: "62500.50", currency: "TZS" }], "TZS").amount).toBe("187500.50");
  });

  it("never combines different currencies implicitly", () => {
    expect(() => addMoney([{ amount: 80, currency: "USD" }, { amount: 125000, currency: "TZS" }], "TZS"))
      .toThrow(/explicit recorded conversion/);
  });

  it("totals per currency and keeps unclassified amounts separate", () => {
    expect(totalsByCurrency(
      [
        { c: "TZS", a: 125000 },
        { c: "USD", a: 0.1 },
        { c: "USD", a: 0.2 },
        { c: null, a: 5 },
        { c: "TZS", a: "250000.00" },
      ],
      (r) => r.c,
      (r) => r.a,
    )).toEqual([
      { currency: "TZS", amount: 375000 },
      { currency: "USD", amount: 0.3 },
      { currency: "UNKNOWN", amount: 5 },
    ]);
  });

  it("represents money with its currency precision", () => {
    expect(money(125000, "TZS")).toEqual({ amount: "125000.00", currency: "TZS", minorUnits: 2 });
    expect(money(125000, "JPY")).toEqual({ amount: "125000", currency: "JPY", minorUnits: 0 });
  });
});

const plain = (value: string) => value.replace(/\u00a0/g, " ");

describe("presentation", () => {
  it("renders the ISO code with the amount and never rounds a fractional amount away", () => {
    expect(plain(formatMoney(125000, "TZS"))).toBe("TZS 125,000");
    expect(plain(formatMoney("125000.00", "TZS"))).toBe("TZS 125,000");
    expect(plain(formatMoney(125.5, "USD"))).toBe("USD 125.50");
    expect(plain(formatMoney(1500, "JPY"))).toBe("JPY 1,500");
    expect(plain(formatMoney(1.234, "KWD"))).toBe("KWD 1.234");
  });

  it("does not invent a currency when one is missing or invalid", () => {
    expect(formatMoney(125000, null)).toBe("—");
    expect(formatMoney(125000, "")).toBe("—");
    expect(formatMoney(125000, "$")).toBe("—");
    expect(formatMoney(null, "TZS")).toBe("—");
  });
});
