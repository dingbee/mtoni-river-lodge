import { describe, expect, it } from "vitest";
import {
  getReconciliationEventAmount,
  reconcileBookingLedger,
  type ReconciliationEvent,
} from "./finance-reconciliation";

const booking = {
  id: "booking-1",
  total: 120,
  paid_amount: 60,
  balance_amount: 60,
  currency: "USD",
};

describe("finance ledger reconciliation", () => {
  it("recognizes atomic Pesapal payment_completed events", () => {
    const event: ReconciliationEvent = {
      id: "event-1",
      booking_id: booking.id,
      event_type: "payment_completed",
      amount: "60.00",
      currency: "USD",
    };
    expect(getReconciliationEventAmount(event)).toBe(60);
    expect(reconcileBookingLedger(booking, [event])).toMatchObject({
      events_total: 60,
      variance: 0,
      derived_balance: 60,
      balance_variance: 0,
      matched: true,
    });
  });

  it("handles signed manual refunds without subtracting twice", () => {
    const events: ReconciliationEvent[] = [
      { id: "p1", booking_id: booking.id, event_type: "manual_payment", amount: 80, currency: "USD" },
      { id: "r1", booking_id: booking.id, event_type: "refund", amount: -20, currency: "USD" },
    ];
    expect(events.map(getReconciliationEventAmount)).toEqual([80, -20]);
    expect(
      reconcileBookingLedger({ ...booking, paid_amount: 60 }, events).events_total,
    ).toBe(60);
  });

  it("normalizes positive refund amounts as debits", () => {
    expect(
      getReconciliationEventAmount({
        id: "r2",
        booking_id: booking.id,
        event_type: "refund_issued",
        amount: 15,
        currency: "USD",
      }),
    ).toBe(-15);
  });

  it("does not treat a provider reversed status callback as a cash refund", () => {
    expect(
      getReconciliationEventAmount({
        id: "status-1",
        booking_id: booking.id,
        event_type: "ipn:reversed",
        amount: 60,
        currency: "USD",
      }),
    ).toBeNull();
  });

  it("flags both outstanding-balance variance and currency mismatch", () => {
    const result = reconcileBookingLedger(
      { ...booking, balance_amount: 50 },
      [{
        id: "p2",
        booking_id: booking.id,
        event_type: "payment_completed",
        amount: 60,
        currency: "TZS",
      }],
    );
    expect(result.balance_variance).toBe(-10);
    expect(result.currency_mismatch).toBe(true);
    expect(result.matched).toBe(false);
  });

  it("does not mark an event with missing currency as reconciled", () => {
    const result = reconcileBookingLedger(booking, [{
      id: "p3",
      booking_id: booking.id,
      event_type: "payment_completed",
      amount: 60,
      currency: null,
    }]);
    expect(result.currency_mismatch).toBe(true);
    expect(result.matched).toBe(false);
  });

  it("ignores non-ledger provider status events", () => {
    expect(
      getReconciliationEventAmount({
        id: "pending-1",
        booking_id: booking.id,
        event_type: "status_check:pending",
        amount: 60,
        currency: "USD",
      }),
    ).toBeNull();
  });
});
