import { describe, expect, it } from "vitest";
import { recordManualPaymentInputSchema } from "./payment-contract";

const valid = {
  bookingId: "00000000-0000-4000-8000-000000000001",
  amount: 60,
  method: "cash",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
};

describe("manual payment request contract", () => {
  it("accepts a deposit or partial payment with a stable idempotency key", () => {
    expect(recordManualPaymentInputSchema.parse(valid)).toMatchObject({
      amount: 60,
      eventType: "manual_payment",
    });
  });

  it("accepts an explicit refund event", () => {
    expect(recordManualPaymentInputSchema.parse({ ...valid, eventType: "refund" }).eventType).toBe("refund");
  });

  it("rejects zero, negative, non-finite, and sub-cent amounts", () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 60.001]) {
      expect(recordManualPaymentInputSchema.safeParse({ ...valid, amount }).success).toBe(false);
    }
  });

  it("rejects missing or malformed idempotency keys", () => {
    expect(recordManualPaymentInputSchema.safeParse({ ...valid, idempotencyKey: "retry" }).success).toBe(false);
  });

  it("rejects adjustments until a non-cash adjustment ledger contract exists", () => {
    expect(recordManualPaymentInputSchema.safeParse({ ...valid, eventType: "adjustment" }).success).toBe(false);
  });
});
