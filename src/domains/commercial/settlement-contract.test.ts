import { describe, expect, it } from "vitest";
import {
  allocateVerifiedSettlement,
  commercialInvoiceSchema,
  reconcileVerifiedSettlement,
  type CommercialInvoice,
  type CommercialPaymentAttempt,
  type VerifiedCommercialSettlement,
} from "./settlement-contract";

const invoice: CommercialInvoice = {
  id: "10000000-0000-4000-8000-000000000001",
  organisationId: "20000000-0000-4000-8000-000000000001",
  commercialAccountId: "30000000-0000-4000-8000-000000000001",
  subscriptionId: "40000000-0000-4000-8000-000000000001",
  invoiceNumber: "SN-CC04-TEST-001",
  currency: "TZS",
  billingTerm: "monthly",
  status: "issued",
  lineItems: [{ lineRef: "plan-base-v1", kind: "plan_base", description: "Approved plan price", quantity: 1, unitAmountMinor: 12000000, amountMinor: 12000000 }],
  amountDueMinor: 12000000,
  amountPaidMinor: 0,
  issuedAt: "2026-11-07T08:00:00Z",
  dueAt: "2026-11-21T08:00:00Z",
  createdAt: "2026-11-07T08:00:00Z",
  updatedAt: "2026-11-07T08:00:00Z",
};

const payment: CommercialPaymentAttempt = {
  id: "50000000-0000-4000-8000-000000000001",
  organisationId: invoice.organisationId,
  commercialAccountId: invoice.commercialAccountId,
  invoiceId: invoice.id,
  provider: "pesapal",
  providerAccountRef: "tenant-pesapal-account-01",
  providerOrderRef: "order-cc04-001",
  idempotencyKey: "cc04-payment-attempt-001",
  currency: "TZS",
  amountMinor: 12000000,
  state: "pending",
  createdAt: "2026-11-07T08:05:00Z",
  updatedAt: "2026-11-07T08:05:00Z",
};

const settlement: VerifiedCommercialSettlement = {
  paymentAttemptId: payment.id,
  provider: "pesapal",
  providerAccountRef: payment.providerAccountRef,
  providerOrderRef: payment.providerOrderRef!,
  providerSettlementRef: "pesapal-settlement-001",
  verifiedAt: "2026-11-07T08:10:00Z",
  verificationSource: "server_provider_query",
  amountMinor: 12000000,
  currency: "TZS",
  idempotencyKey: "cc04-settlement-001",
};

describe("CC-04 subscription settlement contracts", () => {
  it("requires invoice totals to equal immutable line-item totals", () => {
    expect(commercialInvoiceSchema.safeParse(invoice).success).toBe(true);
    expect(commercialInvoiceSchema.safeParse({ ...invoice, amountDueMinor: 12000001 }).success).toBe(false);
  });

  it("accepts only exact amount and currency reconciliation", () => {
    expect(reconcileVerifiedSettlement(
      { amountMinor: 12000000, currency: "TZS" },
      { amountMinor: 12000000, currency: "TZS" },
    )).toEqual({ outcome: "matched", amountMinor: 12000000, currency: "TZS" });
    expect(reconcileVerifiedSettlement(
      { amountMinor: 12000000, currency: "TZS" },
      { amountMinor: 12000000, currency: "USD" },
    ).outcome).toBe("currency_mismatch");
    expect(reconcileVerifiedSettlement(
      { amountMinor: 12000000, currency: "TZS" },
      { amountMinor: 11999999, currency: "TZS" },
    ).outcome).toBe("amount_mismatch");
    expect(reconcileVerifiedSettlement(
      { amountMinor: 12000000, currency: "TZS" },
      { amountMinor: 12000000, currency: null },
    ).outcome).toBe("currency_mismatch");
  });

  it("fully allocates only a verified matching settlement", () => {
    expect(allocateVerifiedSettlement({
      invoice, payment, settlement, existingAllocationKeys: [],
    })).toEqual({ amountPaidMinor: 12000000, outstandingMinor: 0, invoiceStatus: "paid" });
  });

  it("supports partial payment without marking the invoice paid", () => {
    const partialPayment = { ...payment, amountMinor: 5000000 };
    const partialSettlement = { ...settlement, amountMinor: 5000000, idempotencyKey: "cc04-settlement-partial-001" };
    expect(allocateVerifiedSettlement({
      invoice, payment: partialPayment, settlement: partialSettlement, existingAllocationKeys: [],
    })).toEqual({ amountPaidMinor: 5000000, outstandingMinor: 7000000, invoiceStatus: "partially_paid" });
  });

  it("rejects provider notifications as settlement authority", () => {
    expect(() => allocateVerifiedSettlement({
      invoice,
      payment,
      settlement: { ...settlement, verificationSource: "provider_callback" } as unknown as VerifiedCommercialSettlement,
      existingAllocationKeys: [],
    })).toThrow();
  });

  it("rejects cross-tenant, cross-invoice and mismatched provider references", () => {
    expect(() => allocateVerifiedSettlement({
      invoice,
      payment: { ...payment, organisationId: "20000000-0000-4000-8000-000000000099" },
      settlement,
      existingAllocationKeys: [],
    })).toThrow(/does not belong/);
    expect(() => allocateVerifiedSettlement({
      invoice,
      payment,
      settlement: { ...settlement, providerOrderRef: "other-order" },
      existingAllocationKeys: [],
    })).toThrow(/does not match/);
  });

  it("rejects duplicate settlement allocation keys and overpayment", () => {
    expect(() => allocateVerifiedSettlement({
      invoice, payment, settlement, existingAllocationKeys: [settlement.idempotencyKey],
    })).toThrow(/already been allocated/);
    expect(() => allocateVerifiedSettlement({
      invoice,
      payment,
      settlement: { ...settlement, amountMinor: 12000001 },
      existingAllocationKeys: [],
    })).toThrow(/does not match/);
  });

  it("rejects settlement currency different from invoice currency", () => {
    expect(() => allocateVerifiedSettlement({
      invoice,
      payment: { ...payment, currency: "USD" },
      settlement: { ...settlement, currency: "USD" },
      existingAllocationKeys: [],
    })).toThrow(/invoice currency/);
  });

  it("rejects invoice totals with unsafe integer overflow", () => {
    expect(commercialInvoiceSchema.safeParse({
      ...invoice,
      lineItems: [{ ...invoice.lineItems[0]!, unitAmountMinor: Number.MAX_SAFE_INTEGER, amountMinor: Number.MAX_SAFE_INTEGER }],
      amountDueMinor: Number.MAX_SAFE_INTEGER,
    }).success).toBe(true);
    expect(commercialInvoiceSchema.safeParse({
      ...invoice,
      lineItems: [
        { ...invoice.lineItems[0]!, lineRef: "one", amountMinor: Number.MAX_SAFE_INTEGER },
        { ...invoice.lineItems[0]!, lineRef: "two", amountMinor: 1 },
      ],
      amountDueMinor: Number.MAX_SAFE_INTEGER,
    }).success).toBe(false);
  });
});
