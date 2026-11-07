import { z } from "zod";

/**
 * CC-04.01 — Subscription billing and settlement contracts.
 *
 * This domain is intentionally separate from hospitality booking payments.
 * Amounts are integer ISO-4217 minor units. No cross-currency arithmetic or
 * FX conversion is permitted. Provider callbacks are evidence, not settlement
 * authority; only a server-verified provider result can be allocated.
 */
export const CC04_CURRENCIES = ["TZS", "USD"] as const;
export const CC04_BILLING_TERMS = ["monthly", "annual"] as const;
export const CC04_INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;
export const CC04_PAYMENT_STATES = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "partially_reversed",
  "reversed",
] as const;
export const CC04_PAYMENT_PROVIDERS = ["pesapal", "bank_transfer", "manual"] as const;

const uuid = z.string().uuid();
const reference = z.string().trim().min(1).max(200);
const minorAmount = z.number().int().safe().nonnegative();
const positiveMinorAmount = z.number().int().safe().positive();
const timestamp = z.string().datetime({ offset: true });

export const commercialInvoiceLineSchema = z.object({
  lineRef: reference,
  kind: z.enum(["plan_base", "additional_property", "addon", "adjustment"]),
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().positive(),
  unitAmountMinor: minorAmount,
  amountMinor: minorAmount,
});
export type CommercialInvoiceLine = z.infer<typeof commercialInvoiceLineSchema>;

export const commercialInvoiceSchema = z.object({
  id: uuid,
  organisationId: uuid,
  commercialAccountId: uuid,
  subscriptionId: uuid,
  invoiceNumber: reference,
  currency: z.enum(CC04_CURRENCIES),
  billingTerm: z.enum(CC04_BILLING_TERMS),
  status: z.enum(CC04_INVOICE_STATUSES),
  lineItems: z.array(commercialInvoiceLineSchema).min(1),
  amountDueMinor: positiveMinorAmount,
  amountPaidMinor: minorAmount,
  issuedAt: timestamp.nullable(),
  dueAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((invoice, ctx) => {
  const lineTotal = invoice.lineItems.reduce((sum, line) => sum + line.amountMinor, 0);
  if (!Number.isSafeInteger(lineTotal) || lineTotal !== invoice.amountDueMinor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amountDueMinor"],
      message: "Invoice total must equal the immutable sum of its line items",
    });
  }
  if (invoice.amountPaidMinor > invoice.amountDueMinor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amountPaidMinor"],
      message: "Allocated payments cannot exceed the invoice total",
    });
  }
  if (invoice.status !== "draft" && (!invoice.issuedAt || !invoice.dueAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["issuedAt"],
      message: "Issued invoices require issue and due timestamps",
    });
  }
  if (invoice.status === "paid" && invoice.amountPaidMinor !== invoice.amountDueMinor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Paid invoices must be fully allocated",
    });
  }
  if (invoice.status === "partially_paid" && (invoice.amountPaidMinor <= 0 || invoice.amountPaidMinor >= invoice.amountDueMinor)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Partially paid invoices require a positive allocation below the invoice total",
    });
  }
  if (invoice.status === "issued" && invoice.amountPaidMinor !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amountPaidMinor"],
      message: "Issued invoices with no allocations must have zero paid amount",
    });
  }
});
export type CommercialInvoice = z.infer<typeof commercialInvoiceSchema>;

export const commercialPaymentAttemptSchema = z.object({
  id: uuid,
  organisationId: uuid,
  commercialAccountId: uuid,
  invoiceId: uuid,
  provider: z.enum(CC04_PAYMENT_PROVIDERS),
  providerAccountRef: reference,
  providerOrderRef: reference.nullable(),
  idempotencyKey: reference,
  currency: z.enum(CC04_CURRENCIES),
  amountMinor: positiveMinorAmount,
  state: z.enum(CC04_PAYMENT_STATES),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type CommercialPaymentAttempt = z.infer<typeof commercialPaymentAttemptSchema>;

export const commercialProviderNotificationSchema = z.object({
  provider: z.enum(CC04_PAYMENT_PROVIDERS),
  providerAccountRef: reference,
  providerEventRef: reference,
  providerOrderRef: reference,
  receivedAt: timestamp,
  rawPayload: z.record(z.string(), z.unknown()),
});
export type CommercialProviderNotification = z.infer<typeof commercialProviderNotificationSchema>;

export const verifiedCommercialSettlementSchema = z.object({
  paymentAttemptId: uuid,
  provider: z.enum(CC04_PAYMENT_PROVIDERS),
  providerAccountRef: reference,
  providerOrderRef: reference,
  providerSettlementRef: reference,
  verifiedAt: timestamp,
  verificationSource: z.literal("server_provider_query"),
  amountMinor: positiveMinorAmount,
  currency: z.enum(CC04_CURRENCIES),
  idempotencyKey: reference,
});
export type VerifiedCommercialSettlement = z.infer<typeof verifiedCommercialSettlementSchema>;

export const commercialPaymentAllocationSchema = z.object({
  id: uuid,
  organisationId: uuid,
  invoiceId: uuid,
  paymentAttemptId: uuid,
  settlementRef: reference,
  currency: z.enum(CC04_CURRENCIES),
  amountMinor: positiveMinorAmount,
  allocatedAt: timestamp,
  idempotencyKey: reference,
});
export type CommercialPaymentAllocation = z.infer<typeof commercialPaymentAllocationSchema>;

export type SettlementReconciliation =
  | { outcome: "matched"; amountMinor: number; currency: typeof CC04_CURRENCIES[number] }
  | { outcome: "amount_mismatch"; expectedAmountMinor: number; observedAmountMinor: number }
  | { outcome: "currency_mismatch"; expectedCurrency: typeof CC04_CURRENCIES[number]; observedCurrency: string | null };

export function reconcileVerifiedSettlement(
  expected: { amountMinor: number; currency: typeof CC04_CURRENCIES[number] },
  observed: { amountMinor: number; currency: string | null },
): SettlementReconciliation {
  if (observed.currency !== expected.currency) {
    return {
      outcome: "currency_mismatch",
      expectedCurrency: expected.currency,
      observedCurrency: observed.currency,
    };
  }
  if (!Number.isSafeInteger(observed.amountMinor) || observed.amountMinor !== expected.amountMinor) {
    return {
      outcome: "amount_mismatch",
      expectedAmountMinor: expected.amountMinor,
      observedAmountMinor: observed.amountMinor,
    };
  }
  return { outcome: "matched", amountMinor: expected.amountMinor, currency: expected.currency };
}

export function allocateVerifiedSettlement(input: {
  invoice: CommercialInvoice;
  payment: CommercialPaymentAttempt;
  settlement: VerifiedCommercialSettlement;
  existingAllocationKeys: readonly string[];
}): {
  amountPaidMinor: number;
  outstandingMinor: number;
  invoiceStatus: "partially_paid" | "paid";
} {
  const { invoice, payment, settlement } = input;
  commercialInvoiceSchema.parse(invoice);
  commercialPaymentAttemptSchema.parse(payment);
  verifiedCommercialSettlementSchema.parse(settlement);

  if (payment.state !== "pending" && payment.state !== "created") {
    throw new Error("Only an open payment attempt can be settled");
  }
  if (payment.invoiceId !== invoice.id || payment.organisationId !== invoice.organisationId
    || payment.commercialAccountId !== invoice.commercialAccountId) {
    throw new Error("Payment attempt does not belong to this invoice and tenant");
  }
  if (settlement.paymentAttemptId !== payment.id
    || settlement.provider !== payment.provider
    || settlement.providerAccountRef !== payment.providerAccountRef
    || settlement.providerOrderRef !== payment.providerOrderRef) {
    throw new Error("Verified settlement does not match the payment attempt");
  }
  if (input.existingAllocationKeys.includes(settlement.idempotencyKey)) {
    throw new Error("Settlement has already been allocated");
  }
  if (invoice.status === "draft" || invoice.status === "void" || invoice.status === "paid") {
    throw new Error("Invoice is not eligible to receive an allocation");
  }
  const reconciliation = reconcileVerifiedSettlement(
    { amountMinor: payment.amountMinor, currency: payment.currency },
    { amountMinor: settlement.amountMinor, currency: settlement.currency },
  );
  if (reconciliation.outcome !== "matched") {
    throw new Error("Provider settlement does not match the expected amount and currency");
  }
  if (invoice.currency !== settlement.currency) {
    throw new Error("Settlement currency must exactly match invoice currency");
  }
  const outstandingMinor = invoice.amountDueMinor - invoice.amountPaidMinor;
  if (settlement.amountMinor > outstandingMinor) {
    throw new Error("Settlement exceeds the invoice outstanding balance");
  }
  const amountPaidMinor = invoice.amountPaidMinor + settlement.amountMinor;
  return {
    amountPaidMinor,
    outstandingMinor: invoice.amountDueMinor - amountPaidMinor,
    invoiceStatus: amountPaidMinor === invoice.amountDueMinor ? "paid" : "partially_paid",
  };
}
