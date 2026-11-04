import { describe, expect, it } from "vitest";
import { aggregateRevenueLedger } from "./revenue-ledger";

describe("aggregateRevenueLedger", () => {
  it("separates collections, refunds and provider reversals", () => {
    expect(aggregateRevenueLedger([
      { event_type: "payment_completed", amount: 500, currency: "USD" },
      { event_type: "manual_payment", amount: 250, currency: "USD" },
      { event_type: "refund", amount: -100, currency: "USD" },
      { event_type: "provider_reversal", amount: -50, currency: "USD" },
    ])).toEqual([{
      currency: "USD", cashCollected: 750, refunds: 100, providerReversals: 50,
      netCashReceived: 600, successfulCollections: 2, refundEvents: 1, reversalEvents: 1,
    }]);
  });
  it("keeps currencies separate and normalizes codes", () => {
    const rows = aggregateRevenueLedger([
      { event_type: "manual_payment", amount: 100, currency: "tzs" },
      { event_type: "manual_payment", amount: 20, currency: "USD" },
    ]);
    expect(rows.map((row) => [row.currency, row.cashCollected])).toEqual([["TZS", 100], ["USD", 20]]);
  });
  it("ignores pending, failed, unknown, malformed and wrongly signed collections", () => {
    expect(aggregateRevenueLedger([
      { event_type: "payment_pending", amount: 100, currency: "USD" },
      { event_type: "payment_failed", amount: 100, currency: "USD" },
      { event_type: "other", amount: 100, currency: "EUR" },
      { event_type: "manual_payment", amount: -5, currency: "USD" },
      { event_type: "refund", amount: 5, currency: "USD" },
      { event_type: "manual_payment", amount: "NaN", currency: "USD" },
    ])).toEqual([{
      currency: "USD", cashCollected: 0, refunds: 5, providerReversals: 0,
      netCashReceived: -5, successfulCollections: 0, refundEvents: 1, reversalEvents: 0,
    }]);
  });
  it("retains negative net cash when refunds exceed collections", () => {
    const [row] = aggregateRevenueLedger([
      { event_type: "manual_payment", amount: 50, currency: "USD" },
      { event_type: "refund", amount: -75, currency: "USD" },
    ]);
    expect(row.netCashReceived).toBe(-25);
  });
});
